# clustish

[![NPM version](https://badge.fury.io/js/clustish.svg)](//npmjs.com/package/clustish)
[![Build Status](https://travis-ci.org/Come2Daddy/clustish.svg?branch=master)](https://travis-ci.org/Come2Daddy/clustish)

The goal of clustish is to ease implementation of clusters (master/workers) in your projects. You can parallelise tasks while keeping a hand over your workers through the master logic which can provide an stdin interface for example. Dead workers can be respawned automatically.

## Installation
```
npm install clustish
```
or
```
yarn add clustish
```

## Usage
```javascript
const clustish = require("clustish")({
    respawn: false, // Do not respawn worker when it exits
    threadsPerCore: 2 // Number of threads per logical CPU
});

// Common logic should be here if needed

clustish.messageHandler(function(msg) {
    if(this.isMaster) {
        console.log("From worker", msg);
    } else {
        console.log("From master", msg);
    }
}).master(function() {
    // master logic goes here
    var names = ["Charlie", "Juliet", "Mike", "Oscar"];
    var tasks = [[1, 100], [101, 200], [201, 300], [301, 386]];

    this.ready(function() {
        // when all workers have been spawned
        this.workerLogic(function(worker, index) {
            // send each worker its task (could be anything)
            worker.send({"hookname": {"task": tasks[index]}});
        });
    }).done(function() {
        // all workers have exited
        process.exit(0);
    }).eachThread(function(index) {
        // set a worker per thread with its own env
        this.add({"NAME": names[index]});
    }).spawn(); // Spawn workers
}).worker(function() {
    this.hook("hookname", function(task) {
        process.send(`Hi my name is ${process.env.NAME} and I should read a file from line ${task[0]} to ${task[1]}`);

        // worker logic goes here if dependant of a hook
    });

    // worker logic goes here if independant of a hook
    this.exit(0, "Task done !");
});
```
## API

### common

#### options
When instanciate clustish you can pass an object as parameter as follow:
* **respawn**: *boolean* True to respawn a worker that exited.
* **threadsPerCore**: *integer* Number of threads per core.

#### `clustish.messageHandler(callback)`
Defines how messages between master and workers are handled, when not captured by hooks. Using parent property `isMaster` allows you to know which side is reciving.

#### <a name="hook"></a>`clustish.addHook(name, callback, master, worker)`
* **name**: *string* Hook's namepsace.
* **callback**: *function* Hook's logic, one argument is passed from message object.
* **master**: *boolean* True if master can access it.
* **worker**: *boolean* True if workers can access it.

Hook is triggered by sending a message either to master or workers as an object which have said hook's name as a property.




in a worker logic:
```javascript
process.send({"hookname": {"end": true, "lines": 200}})
```
will trigger hook with spacename "hookname" and coresponding value `{"end": true, "lines": 200}}` as a parameter.

```javascript
clustish.addHook("hookname", function(status) {
    if(status.end === true) {
        console.log(`Worker's done with ${status.lines} lines.`);
    }
}, true, false)
```
here only accessible by master.

#### `clustish.master(callback)`
Defines master's logic.

#### `clustish.worker(callback)`
Defines worker's logic.

### master

#### `clustish.cpus()`
Returns number of CPU cores as `integer`.

#### `clustish.threads()`
Returns total number of threads as `integer`, as defined by option `threadsPerCore`.

#### `clustish.eachCPU(callback)`
Loops `callback` over logical CPU count.

#### `clustish.eachCluster(callback)`
Loops `callback` over threads.

#### `clustish.each(callback, number)`
Loops `callback` over defined workers.

#### `clustish.add(env)`
Sets a worker with its `env`.

#### `clustish.hook(name, callback)`
Sets a hook accessible only by master. [See addHook](#hook)
* **name**: *string* Hook's namespace.
* **callback**: *function* Hook's logic, one argument is passed from message object.

#### `clustish.spawn()`
Spawns workers.

#### `clustish.ready(callback)`
Fires `callback` when all workers have spawned.

#### `clustish.done(callback)`
Fires `callback` when all workers have exited.

### worker

#### `clustish.hook(name, callback)`
Sets a hook accessible only by master. [See addHook](#hook)
* **name**: *string* Hook's namespace.
* **callback**: *function* Hook's logic, one argument is passed from message object.

#### `clustish.exit(code, notice)`
Exits worker.
* **code**: *integer* Exit code
* **notice**: *string* Notice to be send to master.