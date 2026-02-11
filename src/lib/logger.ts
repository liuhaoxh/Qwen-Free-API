import path from 'path';
import _util from 'util';

import 'colors';
import _ from 'lodash';
import fs from 'fs-extra';
import { format as dateFormat } from 'date-fns';

import config from './config.ts';
import util from './util.ts';

const isVercelEnv = process.env.VERCEL;

class LogWriter {

    #stream: any = null;
    #currentDate = "";
    #dropping = false;
    #droppedLines = 0;

    constructor() {
        !isVercelEnv && fs.ensureDirSync(config.system.logDirPath);
        if (!isVercelEnv) {
            this.#currentDate = util.getDateString();
            this.#ensureStream();
        }
    }

    #logFilePath() {
        return path.join(config.system.logDirPath, `/${util.getDateString()}.log`);
    }

    #ensureStream() {
        if (isVercelEnv) return;
        const today = util.getDateString();
        if (this.#stream && this.#currentDate === today) return;

        try {
            if (this.#stream) {
                this.#stream.end();
                this.#stream = null;
            }
        } catch { /* ignore */ }

        this.#currentDate = today;
        const filePath = this.#logFilePath();
        this.#stream = fs.createWriteStream(filePath, { flags: "a" });
        this.#stream.on("error", (err: any) => console.error("Log stream error:", err));
    }

    writeSync(buffer: Buffer) {
        if (isVercelEnv) return;
        fs.appendFileSync(this.#logFilePath(), buffer);
    }

    push(content: string) {
        if (isVercelEnv) return;
        this.#ensureStream();
        if (!this.#stream) return;

        // When disk is slow, Node will buffer writes in memory. Avoid unbounded growth by dropping
        // log lines until the stream drains.
        if (this.#dropping) {
            this.#droppedLines++;
            return;
        }

        const ok = this.#stream.write(content);
        if (!ok) {
            this.#dropping = true;
            this.#droppedLines = 0;
            this.#stream.once("drain", () => {
                const dropped = this.#droppedLines;
                this.#dropping = false;
                this.#droppedLines = 0;
                if (dropped > 0) {
                    try {
                        this.#stream && this.#stream.write(`[logger] dropped ${dropped} log lines due to backpressure\n`);
                    } catch { /* ignore */ }
                }
            });
        }
    }

    flush() {
        if (isVercelEnv) return;
        this.#ensureStream();
        // Best-effort: write stream handles flushing itself; nothing buffered here.
    }

    destroy() {
        try {
            this.flush();
            this.#stream && this.#stream.end();
        } catch { /* ignore */ }
        this.#stream = null;
    }

    // backward-compat for existing call sites
    destory() {
        this.destroy();
    }
}

class LogText {

    /** @type {string} 日志级别 */
    level;
    /** @type {string} 日志文本 */
    text;
    /** @type {string} 日志来源 */
    source;
    /** @type {Date} 日志发生时间 */
    time = new Date();

    constructor(level, ...params) {
        this.level = level;
        this.text = _util.format.apply(null, params);
        this.source = this.#getStackTopCodeInfo();
    }

    #getStackTopCodeInfo() {
        const unknownInfo = { name: "unknown", codeLine: 0, codeColumn: 0 };
        const stackArray = new Error().stack.split("\n");
        const text = stackArray[4];
        if (!text)
            return unknownInfo;
        const match = text.match(/at (.+) \((.+)\)/) || text.match(/at (.+)/);
        if (!match || !_.isString(match[2] || match[1]))
            return unknownInfo;
        const temp = match[2] || match[1];
        const _match = temp.match(/([a-zA-Z0-9_\-\.]+)\:(\d+)\:(\d+)$/);
        if (!_match)
            return unknownInfo;
        const [, scriptPath, codeLine, codeColumn] = _match as any;
        return {
            name: scriptPath ? scriptPath.replace(/.js$/, "") : "unknown",
            path: scriptPath || null,
            codeLine: parseInt(codeLine || 0),
            codeColumn: parseInt(codeColumn || 0)
        };
    }

    toString() {
        return `[${dateFormat(this.time, "yyyy-MM-dd HH:mm:ss.SSS")}][${this.level}][${this.source.name}<${this.source.codeLine},${this.source.codeColumn}>] ${this.text}`;
    }

}

class Logger {

    /** @type {Object} 系统配置 */
    config = {};
    /** @type {Object} 日志级别映射 */
    static Level = {
        Success: "success",
        Info: "info",
        Log: "log",
        Debug: "debug",
        Warning: "warning",
        Error: "error",
        Fatal: "fatal"
    };
    /** @type {Object} 日志级别文本颜色樱色 */
    static LevelColor = {
        [Logger.Level.Success]: "green",
        [Logger.Level.Info]: "brightCyan",
        [Logger.Level.Debug]: "white",
        [Logger.Level.Warning]: "brightYellow",
        [Logger.Level.Error]: "brightRed",
        [Logger.Level.Fatal]: "red"
    };
    #writer;

    constructor() {
        this.#writer = new LogWriter();
    }

    header() {
        this.#writer.writeSync(Buffer.from(`\n\n===================== LOG START ${dateFormat(new Date(), "yyyy-MM-dd HH:mm:ss.SSS")} =====================\n\n`));
    }

    footer() {
        this.#writer.flush();  //将未写入文件的日志缓存写入
        this.#writer.writeSync(Buffer.from(`\n\n===================== LOG END ${dateFormat(new Date(), "yyyy-MM-dd HH:mm:ss.SSS")} =====================\n\n`));
    }

    success(...params) {
        const content = new LogText(Logger.Level.Success, ...params).toString();
        console.info(content[Logger.LevelColor[Logger.Level.Success]]);
        this.#writer.push(content + "\n");
    }

    info(...params) {
        const content = new LogText(Logger.Level.Info, ...params).toString();
        console.info(content[Logger.LevelColor[Logger.Level.Info]]);
        this.#writer.push(content + "\n");
    }

    log(...params) {
        const content = new LogText(Logger.Level.Log, ...params).toString();
        console.log(content[Logger.LevelColor[Logger.Level.Log]]);
        this.#writer.push(content + "\n");
    }

    debug(...params) {
        if(!config.system.debug) return;  //非调试模式忽略debug
        const content = new LogText(Logger.Level.Debug, ...params).toString();
        console.debug(content[Logger.LevelColor[Logger.Level.Debug]]);
        this.#writer.push(content + "\n");
    }

    warn(...params) {
        const content = new LogText(Logger.Level.Warning, ...params).toString();
        console.warn(content[Logger.LevelColor[Logger.Level.Warning]]);
        this.#writer.push(content + "\n");
    }

    error(...params) {
        const content = new LogText(Logger.Level.Error, ...params).toString();
        console.error(content[Logger.LevelColor[Logger.Level.Error]]);
        this.#writer.push(content + "\n");
    }

    fatal(...params) {
        const content = new LogText(Logger.Level.Fatal, ...params).toString();
        console.error(content[Logger.LevelColor[Logger.Level.Fatal]]);
        this.#writer.push(content + "\n");
    }

    destory() {
        this.#writer.destory();
    }

}

export default new Logger();
