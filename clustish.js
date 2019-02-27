const cluster = require("cluster");
const os = require("os");

class commonLogic {
    constructor(options = {}) {
        this.isMaster = null;
        this.workerCount = 0;
        this.pids = [];
        this.workers = [];
        this.workersLogic = [];
        this.working = 0;
        this.respawnable = [];
        this.assocEnv = {};
        this.status = {};
        this.hooks = [];

        this.options = { respawn: false, multithreaded: true, ...options};

        this.doneFn = function () { };
        this.readyFn = function () { };
        this.mh = function (message) { console.log("#", message); };
    }

    _message(worker, message) {
        this._hook(worker, message);
    }

    _hook(worker, message) {
        if (typeof (message) === "object") {
            for (let hook in this.hooks) {
                if ((this.hooks[hook].master === true && this.isMaster === true) || (this.hooks[hook].worker === true && this.isMaster === false)) {
                    if (message.hasOwnProperty(hook)) {
                        this.hooks[hook].fn.call(this, message[hook], worker);

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

    _exit(worker, code, sig) {
        if (!sig && code === 0) {
            this._finish();
        } else {
            if (this.options.respawn === true) {
                let pid = worker.process.pid;
                let num = this.pids.indexOf(pid);
                let env = this.assocEnv[pid];
                this.workers[num] = this.assocEnv[pid];
                delete this.assocEnv[pid];
                delete this.status[pid];
                this.pids.splice(this.pids.indexOf(pid), 1);

                var that = this;

                setImmediate(function () { that._respawn(num, env); });
            } else {
                this._finish();
            }
        }
    }

    _ready() {
        this.readyFn.call(this);
    }

    _respawn(num, env) {
        var that = this;
        let fork = cluster.fork(env);
        this.assocEnv[fork.process.pid] = env;
        this.pids[num] = fork.process.pid;
        
        fork.on("online", function () {
            that.status[fork.process.pid] = true;
            
            that.workersLogic[num].call(that, fork, num);
        });
        
        fork.on("message", (message) => {
            that._message(fork, message);
        });
        
        fork.on("exit", (code, sign) => {
            that._exit(fork, code, sign);
        });
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
    constructor(options) {
        super(options);

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
        return this.options.multithreaded === true ? (os.cpus().length / 2) : os.cpus().length;
    }

    threads() {
        return this.cpus();
    }

    eachCPU(logic) {
        this._each(logic, this.cpus());

        return this;
    }

    eachThread(logic) {
        this._each(logic, this.threads());

        return this;
    }

    eachOf(count, logic) {
        this._each(logic, count);

        return this;
    }

    each(logic) {
        if (typeof (logic) === "function") {
            let count = 0;
            for (let id in cluster.workers) {
                this.workersLogic[count] = logic;
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
            this.assocEnv[fork.process.pid] = env;
            this.status[fork.process.pid] = false;
            this.pids.push(fork.process.pid);
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
    constructor(options) {
        super(options);

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
    constructor(options) {
        if (cluster.isMaster) {
            return new masterLogic(options);
        } else {
            return new workerLogic(options);
        }
    }
}

module.exports = function (options) {
    return new clustish(options);
};