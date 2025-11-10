const Activity = require("./Activity")
const Response = require("./Response")
const Validation = require("./Validation")

// Scaffold-style dependencies injection
const actionRegister = require("../deps/actionRegister")
const notification = require("../deps/notification")
const scheduler = require("../deps/scheduler")
const kafkaService = require("../deps/kafka")
const pubSubService = require("../deps/pubsub")
const { cache } = require("../deps/cache")

module.exports = {
    Activity,
    Response,
    Validation,
    // Scaffold deps
    actionRegister,
    notification,
    scheduler,
    kafkaProducer: kafkaService.kafkaService,
    // TMS-style PubSub + Cache
    pubSub: pubSubService,
    cache: cache,
}