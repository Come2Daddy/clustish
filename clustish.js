const cluster = require("cluster");
const os = require("os");

class commonLogic {
    constructor(options = {}) {
        this.isMaster = null;
        this.workerCount = 0;
        this.workers = [];
        this.working = 0;
        this.assocEnv = {};
        this.status = {};
        this.hooks = [];

        this.options = Object.assign({
            resume: false,
            threadsPerCore: 1
        }, (options || {}));

        this.doneFn = function () { };
        this.readyFn = function () { };
        this.mh = function (message) { console.log("#", message); };
    }

    _message(pid, message) {
        this._hook(pid, message);
    }

    _hook(pid, message) {
        if (typeof (message) === "object") {
            for (let hook in this.hooks) {
                if ((this.hooks[hook].master === true && this.isMaster === true) || (this.hooks[hook].worker === true && this.isMaster === false)) {
                    if (message.hasOwnProperty(hook)) {
                        this.hooks[hook].fn.call(this, message[hook]);

                        return true;
                    }
                }
            }
        }

        this._messageHandler(message);
    }

    _messageHandler(message) {
        this.mh.call(this, message);
    }

    _online(pid) {
        this.working++;

        this.status[pid] = true;

        if (this.working === this.workerCount) {
            this._ready();
        }
    }

    _exit(pid, code, sig) {
        if (!sig && code === 0) {
            this._finish();
        } else {
            if (this.options.resume === true) {
                this.workers.push(this.assoc[pid]);
                delete this.assocEnv[pid];
                this.workerCount--;

                this.spawn();
            } else {
                this._finish();
            }
        }
    }

    _ready() {
        this.readyFn.call(this);
    }

    _finish() {
        this.working--;

        if (this.working === 0) {
            this.doneFn.call(this);
        }
    }

    _addHook(name, fn, master = true, worker = true) {
        if (typeof (fn) === "function" && (master === true || worker === true)) {
            this.hooks[name] = { fn, master, worker };
        }

        return this;
    }

    addHook(name, fn, master = true, worker = true) {
        this._addHook(name, fn, master, worker);

        return this;
    }

    messageHandler(fn) {
        if (typeof (fn) === "function") {
            this.mh = fn;
        }

        return this;
    }

    master() {
        return this;
    }

    worker() {
        return this;
    }
}

class masterLogic extends commonLogic {
    constructor() {
        super();

        this.isMaster = true;
    }

    _each(logic, num) {
        if (typeof (logic) === "function") {
            for (let i = 0; i < num; i++) {
                logic.call(this, i);
            }
        }

        return this;
    }

    master(logic) {
        if (typeof (logic) === "function") {
            logic.call(this);
        }

        return this;
    }

    cpus() {
        return os.cpus().length;
    }

    threads() {
        if (!Number.isInteger(this.options.threadsPerCore)) this.options.threadsPerCore = 1;
        if (this.options.threadsPerCore < 1) this.options.threadsPerCore = 1;

        return this.cpus() * this.options.threadsPerCore;
    }

    eachCPU(logic) {
        this._each(logic, this.cpus());

        return this;
    }

    eachThread(logic) {
        this._each(logic, this.threads());

        return this;
    }

    each(logic) {
        if (typeof (logic) === "function") {
            let count = 0;
            for (let id in cluster.workers) {
                logic.call(this, cluster.workers[id], count);
                count++;
            }
        }

        return this;
    }

    add(env) {
        this.workers.push(env);

        return this;
    }

    hook(name, fn) {
        this._addHook(name, fn, true, false);

        return this;
    }

    _bindEvent(worker) {
        worker.on("online", () => {
            this._online(worker);
        });

        worker.on("message", (message) => {
            this._message(worker, message);
        });

        worker.on("exit", (code, sign) => {
            this._exit(worker, code, sign);
        });
    }

    spawn() {
        for (let env of this.workers) {
            let fork = cluster.fork(env);
            this.assocEnv[fork.pid] = env;
            this.status[fork.pid] = false;
            this.workerCount++;
        }

        this.workers = [];

        for (let id in cluster.workers) {
            this._bindEvent(cluster.workers[id]);
        }
    }

    ready(fn) {
        if (typeof (fn) === "function") {
            this.readyFn = fn;
        }

        return this;
    }

    done(fn) {
        if (typeof (fn) === "function") {
            this.doneFn = fn;
        }

        return this;
    }
}

class workerLogic extends commonLogic {
    constructor() {
        super();

        this.isMaster = false;
    }

    _listen() {
        process.on("message", (message) => {
            this._message(process, message);
        });
    }

    worker(logic) {
        this._listen();
        if (typeof (logic) === "function") {
            logic.call(this);
        }

        return this;
    }

    hook(name, fn) {
        this._addHook(name, fn, false, true);

        return this;
    }

    exit(code = 0, notice = null) {
        if (notice !== null) {
            process.send(notice);
        }

        process.exit(code);
    }
}

class clustish {
    constructor() {
        if (cluster.isMaster) {
            return new masterLogic();
        } else {
            return new workerLogic();
        }
    }
}

module.exports = function (options) {
    return new clustish(options);
};