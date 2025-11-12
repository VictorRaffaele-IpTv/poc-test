const { Kafka } = require("kafkajs")
const config = require("../../config")

/**
 * Obtém o LAG (mensagens pendentes) de todos os consumer groups do Kafka
 * Útil para monitoramento remoto via API
 */
async function getKafkaLag(deps, context) {
    try {
        const kafka = new Kafka(config.kafka)
        const admin = kafka.admin()
        
        await admin.connect()
        
        try {
            // Listar todos os grupos de consumers
            const groups = await admin.listGroups()
            
            // Filtrar apenas grupos AVI
            const aviGroups = groups.groups.filter(g => 
                g.groupId.startsWith('avi-')
            )
            
            let totalLag = 0
            const groupsLag = []
            
            // Para cada grupo, obter offsets e calcular LAG
            for (const group of aviGroups) {
                try {
                    const offsets = await admin.fetchOffsets({ groupId: group.groupId })
                    
                    let groupLag = 0
                    const topicsLag = []
                    
                    for (const topic of offsets) {
                        let topicLag = 0
                        
                        for (const partition of topic.partitions) {
                            // LAG = log-end-offset - current-offset
                            const currentOffset = Number.parseInt(partition.offset) || 0
                            
                            // Buscar o log-end-offset (último offset disponível)
                            const topicOffsets = await admin.fetchTopicOffsets(topic.topic)
                            const partitionData = topicOffsets.find(p => p.partition === partition.partition)
                            const logEndOffset = Number.parseInt(partitionData?.high) || 0
                            
                            const lag = Math.max(0, logEndOffset - currentOffset)
                            topicLag += lag
                        }
                        
                        topicsLag.push({
                            topic: topic.topic,
                            lag: topicLag
                        })
                        
                        groupLag += topicLag
                    }
                    
                    groupsLag.push({
                        group_id: group.groupId,
                        total_lag: groupLag,
                        topics: topicsLag
                    })
                    
                    totalLag += groupLag
                    
                } catch (groupError) {
                    console.error(`Error fetching lag for group ${group.groupId}:`, groupError.message)
                    groupsLag.push({
                        group_id: group.groupId,
                        total_lag: 0,
                        error: groupError.message
                    })
                }
            }
            
            await admin.disconnect()
            
            return {
                success: true,
                data: {
                    total_lag: totalLag,
                    groups_count: aviGroups.length,
                    groups: groupsLag,
                    timestamp: new Date().toISOString()
                }
            }
            
        } catch (error) {
            await admin.disconnect()
            throw error
        }
        
    } catch (error) {
        console.error("Error getting Kafka LAG:", error)
        
        return {
            success: false,
            error: {
                message: "Failed to get Kafka LAG",
                details: error.message
            },
            data: {
                total_lag: 0,
                groups_count: 0,
                groups: [],
                error: error.message
            }
        }
    }
}

module.exports = getKafkaLag
