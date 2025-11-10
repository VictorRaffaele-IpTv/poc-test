#!/bin/bash
set -e

echo "Configurando pg_hba.conf para permitir conexões externas..."

# Adicionar regra para conexões externas
echo "host    all             all             0.0.0.0/0               md5" >> /var/lib/postgresql/data/pg_hba.conf

echo "pg_hba.conf configurado com sucesso!"