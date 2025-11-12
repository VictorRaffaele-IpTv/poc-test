const express = require("express")
const router = express.Router()
const { queueCreateRequests, queueReadRequests, queueSystemRequests, getAllStats } = require("../middleware/queueManager")
const { cacheMiddleware, CACHE_TTL } = require("../deps/cacheMiddleware")

// TMS-style dependency injection
const getDependencies = () => {
    return require("../repository") // Já inclui todas as deps: Activity, Response, Validation, actionRegister, etc.
}

// TMS-style route handlers with queue middlewares + CACHE
const routes = [
    {
        method: "GET",
        path: "/activity",
        handler: "activity/list",
        middleware: [cacheMiddleware('activities', CACHE_TTL.activities_list), queueReadRequests()],
    },
    {
        method: "POST", 
        path: "/activity",
        handler: "activity/create",
        middleware: queueCreateRequests(),
    },
    {
        method: "GET",
        path: "/activity/:id",
        handler: "activity/get",
        middleware: [cacheMiddleware('activity_detail', CACHE_TTL.activity_detail), queueReadRequests()],
    },
    {
        method: "PUT",
        path: "/activity/:id", 
        handler: "activity/update",
        middleware: queueCreateRequests(),
    },
    {
        method: "DELETE",
        path: "/activity/:id",
        handler: "activity/delete",
        middleware: queueCreateRequests(),
    },
    {
        method: "POST",
        path: "/activity/:activity_id/response", 
        handler: "response/create",
        middleware: queueCreateRequests(),
    },
    {
        method: "GET",
        path: "/response/:id",
        handler: "response/get",
        middleware: [cacheMiddleware('response_detail', CACHE_TTL.response_detail), queueReadRequests()],
    },
]

// Generic route processor with dependency injection
function createRouteHandler(handlerPath) {
    return async (req, res, next) => {
        try {
            // Load handler dynamically
            const handler = require(`../functions/${handlerPath}`)
            
            // Inject dependencies TMS-style
            const deps = getDependencies()
            
            // Prepare request context
            const context = {
                params: req.params,
                body: req.body,
                query: req.query,
                headers: req.headers,
                user: req.user || null, // Se tiver autenticação
                ip: req.ip,
                method: req.method,
                path: req.path,
            }
            
            // Execute handler with injected dependencies
            const result = await handler(deps, context)
            
            // Send response
            const statusCode = req.method === "POST" ? 201 : 200
            res.status(statusCode).json(result)
            
        } catch (error) {
            next(error)
        }
    }
}

// Register all routes with cache + queue middleware
for (const route of routes) {
    const method = route.method.toLowerCase()
    if (route.middleware) {
        // Se middleware for array, aplicar todos
        const middlewares = Array.isArray(route.middleware) ? route.middleware : [route.middleware]
        router[method](route.path, ...middlewares, createRouteHandler(route.handler))
    } else {
        router[method](route.path, createRouteHandler(route.handler))
    }
}

// Additional TMS-style routes
router.get("/audit-log", cacheMiddleware('audit_logs', CACHE_TTL.audit_logs), createRouteHandler("audit/get-audit-log"))
router.get("/stats", cacheMiddleware('stats', CACHE_TTL.stats), createRouteHandler("stats/get-statistics"))
router.get("/stats/app", cacheMiddleware('stats', CACHE_TTL.stats), queueReadRequests(), createRouteHandler("stats/app-statistics"))

// TMS-style System Management routes (PubSub + Cache) with queue
router.get("/system/monitoring", queueSystemRequests(), createRouteHandler("system/monitoring"))
router.post("/system/cache-management", queueSystemRequests(), createRouteHandler("system/cache-management"))
router.post("/system/pubsub-test", queueSystemRequests(), createRouteHandler("system/pubsub-test"))

// Queue statistics endpoint
router.get("/system/queue-stats", (req, res) => {
    res.json({
        success: true,
        data: getAllStats(),
        timestamp: new Date().toISOString()
    })
})

// Kafka LAG endpoint (for remote monitoring)
router.get("/system/kafka-lag", queueSystemRequests(), createRouteHandler("system/kafka-lag"))

// Batch Management routes with queue
router.get("/batch/stats", queueSystemRequests(), require('../functions/batch/batch-management').getBatchProcessorStats)
router.post("/batch/flush-all", queueSystemRequests(), require('../functions/batch/batch-management').flushAllBatches)
router.post("/batch/test", queueSystemRequests(), require('../functions/batch/batch-management').testBatchSystem)

module.exports = router