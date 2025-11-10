-- Inicialização do banco de dados AVI
-- Configurar usuário para acesso externo

-- Garantir que o usuário avi_user tenha todas as permissões necessárias
ALTER USER avi_user WITH SUPERUSER;
GRANT ALL PRIVILEGES ON DATABASE avi_db TO avi_user;
ALTER DATABASE avi_db OWNER TO avi_user;

-- Criar banco de teste se não existir
CREATE DATABASE avi_test_db WITH OWNER avi_user;