const express = require("express")
const router = express.Router()

// TMS-style dependency injection
const getDependencies = () => {
    return require("../repository") // Já inclui todas as deps: Activity, Response, Validation, actionRegister, etc.
}

// TMS-style route handlers
const routes = [
    {
        method: "GET",
        path: "/activity",
        handler: "activity/list",
    },
    {
        method: "POST", 
        path: "/activity",
        handler: "activity/create",
    },
    {
        method: "GET",
        path: "/activity/:id",
        handler: "activity/get",
    },
    {
        method: "PUT",
        path: "/activity/:id", 
        handler: "activity/update",
    },
    {
        method: "DELETE",
        path: "/activity/:id",
        handler: "activity/delete",
    },
    {
        method: "POST",
        path: "/activity/:activity_id/response", 
        handler: "response/create",
    },
    {
        method: "GET",
        path: "/response/:id",
        handler: "response/get",
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

// Register all routes
for (const route of routes) {
    const method = route.method.toLowerCase()
    router[method](route.path, createRouteHandler(route.handler))
}

// Additional TMS-style routes
router.get("/audit-log", createRouteHandler("audit/get-audit-log"))
router.get("/stats", createRouteHandler("stats/get-statistics"))

// TMS-style System Management routes (PubSub + Cache)
router.get("/system/monitoring", createRouteHandler("system/monitoring"))
router.post("/system/cache-management", createRouteHandler("system/cache-management"))
router.post("/system/pubsub-test", createRouteHandler("system/pubsub-test"))

// Batch Management routes
router.get("/batch/stats", require('../functions/batch/batch-management').getBatchProcessorStats)
router.post("/batch/flush-all", require('../functions/batch/batch-management').flushAllBatches)
router.post("/batch/test", require('../functions/batch/batch-management').testBatchSystem)

module.exports = router