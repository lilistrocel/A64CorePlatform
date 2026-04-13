#!/usr/bin/env bash
# ================================
# A64 Core Platform - Multi-Instance Manager
# Manages isolated instances with separate containers, databases, and ports
# ================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE_DIR="$SCRIPT_DIR/_template"
INSTANCES_DIR="$SCRIPT_DIR"

# Cloudflare Tunnel Configuration
CLOUDFLARED_CONFIG="$HOME/.cloudflared/config.yml"
CLOUDFLARE_DOMAIN="a20core.com"
CLOUDFLARED_TUNNEL_ID="3a2d27fa-71b9-4264-ab44-4c161a12ec9b"

# Default port ranges (base ports for first instance, incremented per instance)
DEFAULT_BASE_PORTS=(
    API_PORT:8000
    MONGODB_PORT:27017
    REDIS_PORT:6379
    NGINX_HTTP_PORT:80
    NGINX_HTTPS_PORT:443
    ADMINER_PORT:8080
    REGISTRY_PORT:5050
    USER_PORTAL_PORT:5173
    USER_PORTAL_PROD_PORT:8081
    IOT_SIM_PORT:8090
)

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

usage() {
    cat <<EOF
${CYAN}A64 Core Platform - Multi-Instance Manager${NC}

${YELLOW}Usage:${NC}
    $0 <command> [options]

${YELLOW}Commands:${NC}
    ${GREEN}create${NC}  <name> [--port-offset N]   Create a new instance
    ${GREEN}list${NC}                                List all instances
    ${GREEN}start${NC}   <name> [--prod]             Start an instance (dev or prod mode)
    ${GREEN}stop${NC}    <name>                       Stop an instance
    ${GREEN}destroy${NC} <name> [--volumes]           Destroy an instance (optionally remove volumes)
    ${GREEN}status${NC}  [name]                       Show status of instance(s)
    ${GREEN}logs${NC}    <name> [service]             Show logs for an instance
    ${GREEN}ports${NC}   [name]                       Show port assignments
    ${GREEN}shell${NC}   <name> <service>             Open shell in a service container

${YELLOW}Examples:${NC}
    $0 create client-acme --port-offset 1    # Creates instance + subdomain + tunnel
    $0 create client-beta --port-offset 2
    $0 start client-acme                     # Start in dev mode
    $0 start client-acme --prod              # Start in production mode
    $0 status
    $0 logs client-acme api
    $0 destroy client-beta --volumes         # Removes containers, tunnel, DNS reminder

${YELLOW}Port Offset:${NC}
    Each instance needs unique ports. Use --port-offset to auto-assign:
      Offset 0 (default): 8000, 27017, 6379, 80, 443, 8080, 5050, 5173, 8081, 8090
      Offset 1:           8001, 27018, 6380, 81, 444, 8082, 5051, 5174, 8083, 8091
      Offset 2:           8002, 27019, 6381, 82, 445, 8084, 5052, 5175, 8085, 8092

${YELLOW}Cloudflare Tunnel:${NC}
    On create: automatically adds DNS CNAME record + tunnel ingress rule + restarts tunnel
    On destroy: removes tunnel ingress rule + reminds to delete DNS record
    Subdomain pattern: <name>.${CLOUDFLARE_DOMAIN}
EOF
}

log_info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

validate_name() {
    local name="$1"
    if [[ ! "$name" =~ ^[a-z][a-z0-9-]*$ ]]; then
        log_error "Instance name must start with a letter and contain only lowercase letters, numbers, and hyphens"
        exit 1
    fi
    if [[ "$name" == "_template" ]]; then
        log_error "Cannot use '_template' as instance name"
        exit 1
    fi
}

instance_exists() {
    [[ -d "$INSTANCES_DIR/$1" ]]
}

get_env_file() {
    echo "$INSTANCES_DIR/$1/.env"
}

get_nginx_conf() {
    echo "$INSTANCES_DIR/$1/nginx.conf"
}

# Calculate ports with offset
calc_port() {
    local base=$1
    local offset=$2
    # For ports that are commonly used (80, 443), use larger increments
    if [[ $base -eq 80 ]]; then
        echo $((base + offset))
    elif [[ $base -eq 443 ]]; then
        echo $((base + offset))
    elif [[ $base -eq 8080 ]]; then
        echo $((base + offset * 2))  # Skip odd ports for adminer
    elif [[ $base -eq 8081 ]]; then
        echo $((base + offset * 2))
    else
        echo $((base + offset))
    fi
}

# ================================
# CLOUDFLARE TUNNEL MANAGEMENT
# ================================

# Check if a port is already in use
check_port_available() {
    local port=$1
    if ss -tlnp 2>/dev/null | grep -q ":${port} "; then
        return 1  # Port in use
    fi
    return 0  # Port available
}

# Check all ports for an instance and warn about conflicts
check_ports() {
    local env_file="$1"
    local conflicts=false
    while IFS='=' read -r key val; do
        if ! check_port_available "$val"; then
            log_warn "Port $val ($key) is already in use"
            conflicts=true
        fi
    done < <(grep "_PORT=" "$env_file" | grep -v "^#")
    if $conflicts; then
        log_warn "Edit the .env file to change conflicting ports before starting"
        return 1
    fi
    return 0
}

# Add ingress rule to cloudflared config
tunnel_add_ingress() {
    local name="$1"
    local port="$2"
    local hostname="${name}.${CLOUDFLARE_DOMAIN}"

    if [[ ! -f "$CLOUDFLARED_CONFIG" ]]; then
        log_warn "Cloudflared config not found at $CLOUDFLARED_CONFIG — skipping tunnel setup"
        return 1
    fi

    # Check if ingress already exists
    if grep -q "hostname: ${hostname}" "$CLOUDFLARED_CONFIG" 2>/dev/null; then
        log_info "Tunnel ingress for ${hostname} already exists"
        return 0
    fi

    # Insert new ingress rule before the first existing hostname entry
    # This ensures it's after the "ingress:" line but before other rules
    local ingress_block="  - hostname: ${hostname}\n    service: http://localhost:${port}\n    originRequest:\n      keepAliveConnections: 100\n      keepAliveTimeout: 90s\n      connectTimeout: 10s"

    sed -i "/^ingress:/a\\${ingress_block}" "$CLOUDFLARED_CONFIG"

    log_info "Added tunnel ingress: ${hostname} -> localhost:${port}"
    return 0
}

# Remove ingress rule from cloudflared config
tunnel_remove_ingress() {
    local name="$1"
    local hostname="${name}.${CLOUDFLARE_DOMAIN}"

    if [[ ! -f "$CLOUDFLARED_CONFIG" ]]; then
        return 0
    fi

    if ! grep -q "hostname: ${hostname}" "$CLOUDFLARED_CONFIG" 2>/dev/null; then
        return 0
    fi

    # Remove the ingress block (hostname line + following service/originRequest lines)
    # Use awk to remove from the hostname line until the next "- hostname:" or "- service:" entry
    awk -v host="$hostname" '
    BEGIN { skip=0 }
    /^  - hostname:/ {
        if (index($0, host) > 0) { skip=1; next }
        else { skip=0 }
    }
    /^  - service:/ {
        if (skip) { skip=0; next }
    }
    skip && /^    / { next }
    skip && /^  -/ { skip=0 }
    { print }
    ' "$CLOUDFLARED_CONFIG" > "${CLOUDFLARED_CONFIG}.tmp" && mv "${CLOUDFLARED_CONFIG}.tmp" "$CLOUDFLARED_CONFIG"

    log_info "Removed tunnel ingress for ${hostname}"
}

# Add DNS CNAME record via cloudflared
tunnel_add_dns() {
    local name="$1"
    local hostname="${name}.${CLOUDFLARE_DOMAIN}"

    if ! command -v cloudflared &>/dev/null; then
        log_warn "cloudflared not found — add DNS record manually: CNAME ${hostname} -> ${CLOUDFLARED_TUNNEL_ID}.cfargotunnel.com"
        return 1
    fi

    log_info "Adding DNS record for ${hostname}..."
    if cloudflared tunnel route dns a20core "$hostname" 2>&1; then
        log_info "DNS record added: ${hostname}"
    else
        log_warn "DNS record may already exist or failed — check Cloudflare dashboard"
    fi
}

# Remove DNS record (informational only — cloudflared CLI can't delete DNS)
tunnel_remove_dns() {
    local name="$1"
    local hostname="${name}.${CLOUDFLARE_DOMAIN}"
    log_warn "Remember to manually delete the DNS CNAME record for ${hostname} in Cloudflare dashboard"
}

# Restart cloudflared service
tunnel_restart() {
    log_info "Restarting Cloudflare tunnel..."
    if systemctl is-active --quiet cloudflared 2>/dev/null; then
        sudo systemctl restart cloudflared
        log_info "Cloudflare tunnel restarted"
    else
        # Fallback: kill and restart the process
        local pid
        pid=$(pgrep -f "cloudflared tunnel run" 2>/dev/null || true)
        if [[ -n "$pid" ]]; then
            kill "$pid" 2>/dev/null || true
            sleep 2
            nohup cloudflared tunnel run a20core &>/dev/null &
            log_info "Cloudflare tunnel restarted (PID: $!)"
        else
            log_warn "Could not find cloudflared process to restart"
        fi
    fi
}

# ================================
# COMMANDS
# ================================

cmd_create() {
    local name=""
    local port_offset=0

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --port-offset) port_offset="$2"; shift 2 ;;
            -*) log_error "Unknown option: $1"; exit 1 ;;
            *) name="$1"; shift ;;
        esac
    done

    if [[ -z "$name" ]]; then
        log_error "Instance name required"
        usage
        exit 1
    fi

    validate_name "$name"

    if instance_exists "$name"; then
        log_error "Instance '$name' already exists"
        exit 1
    fi

    log_info "Creating instance: $name (port offset: $port_offset)"

    # Create instance directory
    local inst_dir="$INSTANCES_DIR/$name"
    mkdir -p "$inst_dir"

    # Generate nginx configs from templates (dev + prod)
    local nginx_dev_conf="$inst_dir/nginx.dev.conf"
    local nginx_prod_conf="$inst_dir/nginx.prod.conf"
    sed "s/{{INSTANCE_NAME}}/$name/g" "$TEMPLATE_DIR/nginx.dev.conf.tpl" > "$nginx_dev_conf"
    sed "s/{{INSTANCE_NAME}}/$name/g" "$TEMPLATE_DIR/nginx.prod.conf.tpl" > "$nginx_prod_conf"
    log_info "Generated nginx configs: dev + prod"

    # Calculate ports
    local api_port=$(calc_port 8000 "$port_offset")
    local mongodb_port=$(calc_port 27017 "$port_offset")
    local redis_port=$(calc_port 6379 "$port_offset")
    local nginx_http_port=$(calc_port 80 "$port_offset")
    local nginx_https_port=$(calc_port 443 "$port_offset")
    local adminer_port=$(calc_port 8080 "$port_offset")
    local registry_port=$(calc_port 5050 "$port_offset")
    local user_portal_port=$(calc_port 5173 "$port_offset")
    local user_portal_prod_port=$(calc_port 8081 "$port_offset")
    local iot_sim_port=$(calc_port 8090 "$port_offset")

    # Generate .env from template
    local env_file="$inst_dir/.env"
    sed -e "s|{{INSTANCE_NAME}}|$name|g" \
        -e "s|{{API_PORT}}|$api_port|g" \
        -e "s|{{MONGODB_PORT}}|$mongodb_port|g" \
        -e "s|{{REDIS_PORT}}|$redis_port|g" \
        -e "s|{{NGINX_HTTP_PORT}}|$nginx_http_port|g" \
        -e "s|{{NGINX_HTTPS_PORT}}|$nginx_https_port|g" \
        -e "s|{{ADMINER_PORT}}|$adminer_port|g" \
        -e "s|{{REGISTRY_PORT}}|$registry_port|g" \
        -e "s|{{USER_PORTAL_PORT}}|$user_portal_port|g" \
        -e "s|{{USER_PORTAL_PROD_PORT}}|$user_portal_prod_port|g" \
        -e "s|{{IOT_SIM_PORT}}|$iot_sim_port|g" \
        -e "s|{{NGINX_CONF}}|$nginx_dev_conf|g" \
        "$TEMPLATE_DIR/env.tpl" > "$env_file"

    log_info "Generated env file: $env_file"

    # Check for port conflicts
    check_ports "$env_file" || true

    # Setup Cloudflare tunnel
    tunnel_add_dns "$name"
    tunnel_add_ingress "$name" "$nginx_http_port"
    tunnel_restart

    echo ""
    echo -e "${CYAN}Instance '$name' created successfully!${NC}"
    echo ""
    echo -e "${YELLOW}Port assignments:${NC}"
    echo "  API:          $api_port"
    echo "  MongoDB:      $mongodb_port"
    echo "  Redis:        $redis_port"
    echo "  Nginx HTTP:   $nginx_http_port"
    echo "  Nginx HTTPS:  $nginx_https_port"
    echo "  Adminer:      $adminer_port"
    echo "  Registry:     $registry_port"
    echo "  User Portal:  $user_portal_port"
    echo "  Portal (prod):$user_portal_prod_port"
    echo "  IoT Sim:      $iot_sim_port"
    echo ""
    echo -e "${YELLOW}Subdomain:${NC}  https://${name}.${CLOUDFLARE_DOMAIN}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "  1. Edit $env_file to customize settings (API keys, passwords, etc.)"
    echo "  2. Start: $0 start $name"
}

cmd_list() {
    echo -e "${CYAN}Instances:${NC}"
    local found=false
    for dir in "$INSTANCES_DIR"/*/; do
        local name
        name="$(basename "$dir")"
        [[ "$name" == "_template" ]] && continue
        [[ ! -f "$dir/.env" ]] && continue
        found=true

        # Check if running
        local project_name
        project_name=$(grep "^COMPOSE_PROJECT_NAME=" "$dir/.env" 2>/dev/null | cut -d= -f2)
        local running="stopped"
        if [[ -n "$project_name" ]]; then
            local count
            count=$(docker compose -p "$project_name" ps -q 2>/dev/null | wc -l)
            if [[ $count -gt 0 ]]; then
                running="${GREEN}running ($count containers)${NC}"
            else
                running="${RED}stopped${NC}"
            fi
        fi

        echo -e "  ${BLUE}$name${NC} - $running"
    done

    if ! $found; then
        echo "  (no instances found)"
    fi
}

cmd_start() {
    local name=""
    local prod=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --prod) prod=true; shift ;;
            -*) log_error "Unknown option: $1"; exit 1 ;;
            *) name="$1"; shift ;;
        esac
    done

    if [[ -z "$name" ]]; then
        log_error "Instance name required"
        exit 1
    fi

    if ! instance_exists "$name"; then
        log_error "Instance '$name' does not exist. Create it first with: $0 create $name"
        exit 1
    fi

    local env_file
    env_file=$(get_env_file "$name")

    # Check for port conflicts before starting
    check_ports "$env_file" || true

    log_info "Starting instance: $name"

    local inst_dir="$INSTANCES_DIR/$name"

    if $prod; then
        log_info "Mode: PRODUCTION"
        # Use prod nginx config
        NGINX_CONF="$inst_dir/nginx.prod.conf" docker compose \
            --env-file "$env_file" \
            -f "$PROJECT_ROOT/docker-compose.yml" \
            -f "$PROJECT_ROOT/docker-compose.prod.yml" \
            -p "$name" \
            up -d --build
    else
        log_info "Mode: DEVELOPMENT"
        docker compose \
            --env-file "$env_file" \
            -f "$PROJECT_ROOT/docker-compose.yml" \
            -p "$name" \
            up -d --build
    fi

    echo ""
    log_info "Instance '$name' started!"
    cmd_ports "$name"
}

cmd_stop() {
    local name="$1"

    if [[ -z "$name" ]]; then
        log_error "Instance name required"
        exit 1
    fi

    if ! instance_exists "$name"; then
        log_error "Instance '$name' does not exist"
        exit 1
    fi

    local env_file
    env_file=$(get_env_file "$name")

    log_info "Stopping instance: $name"
    docker compose \
        --env-file "$env_file" \
        -f "$PROJECT_ROOT/docker-compose.yml" \
        -p "$name" \
        down
    log_info "Instance '$name' stopped"
}

cmd_destroy() {
    local name=""
    local remove_volumes=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --volumes) remove_volumes=true; shift ;;
            -*) log_error "Unknown option: $1"; exit 1 ;;
            *) name="$1"; shift ;;
        esac
    done

    if [[ -z "$name" ]]; then
        log_error "Instance name required"
        exit 1
    fi

    if ! instance_exists "$name"; then
        log_error "Instance '$name' does not exist"
        exit 1
    fi

    local env_file
    env_file=$(get_env_file "$name")

    echo -e "${RED}WARNING: This will destroy instance '$name'${NC}"
    if $remove_volumes; then
        echo -e "${RED}WARNING: This will also DELETE ALL DATA (database, redis, registry)${NC}"
    fi
    read -rp "Are you sure? (y/N): " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        log_info "Cancelled"
        exit 0
    fi

    log_info "Destroying instance: $name"

    local vol_flag=""
    if $remove_volumes; then
        vol_flag="-v"
    fi

    docker compose \
        --env-file "$env_file" \
        -f "$PROJECT_ROOT/docker-compose.yml" \
        -p "$name" \
        down $vol_flag 2>/dev/null || true

    # Remove Cloudflare tunnel config
    tunnel_remove_ingress "$name"
    tunnel_restart
    tunnel_remove_dns "$name"

    rm -rf "$INSTANCES_DIR/$name"
    log_info "Instance '$name' destroyed"
}

cmd_status() {
    local name="${1:-}"

    if [[ -n "$name" ]]; then
        if ! instance_exists "$name"; then
            log_error "Instance '$name' does not exist"
            exit 1
        fi

        local env_file
        env_file=$(get_env_file "$name")
        echo -e "${CYAN}Instance: $name${NC}"
        docker compose \
            --env-file "$env_file" \
            -f "$PROJECT_ROOT/docker-compose.yml" \
            -p "$name" \
            ps
    else
        for dir in "$INSTANCES_DIR"/*/; do
            local n
            n="$(basename "$dir")"
            [[ "$n" == "_template" ]] && continue
            [[ ! -f "$dir/.env" ]] && continue

            echo -e "${CYAN}Instance: $n${NC}"
            local env_file="$dir/.env"
            docker compose \
                --env-file "$env_file" \
                -f "$PROJECT_ROOT/docker-compose.yml" \
                -p "$n" \
                ps 2>/dev/null || echo "  (not running)"
            echo ""
        done
    fi
}

cmd_logs() {
    local name="$1"
    local service="${2:-}"

    if [[ -z "$name" ]]; then
        log_error "Instance name required"
        exit 1
    fi

    if ! instance_exists "$name"; then
        log_error "Instance '$name' does not exist"
        exit 1
    fi

    local env_file
    env_file=$(get_env_file "$name")

    if [[ -n "$service" ]]; then
        docker compose \
            --env-file "$env_file" \
            -f "$PROJECT_ROOT/docker-compose.yml" \
            -p "$name" \
            logs -f --tail=100 "$service"
    else
        docker compose \
            --env-file "$env_file" \
            -f "$PROJECT_ROOT/docker-compose.yml" \
            -p "$name" \
            logs -f --tail=50
    fi
}

cmd_ports() {
    local name="${1:-}"

    if [[ -n "$name" ]]; then
        if ! instance_exists "$name"; then
            log_error "Instance '$name' does not exist"
            exit 1
        fi

        local env_file
        env_file=$(get_env_file "$name")
        echo -e "${CYAN}Ports for '$name':${NC}"
        grep "_PORT=" "$env_file" | grep -v "^#" | while IFS='=' read -r key val; do
            printf "  %-25s %s\n" "$key" "$val"
        done
    else
        for dir in "$INSTANCES_DIR"/*/; do
            local n
            n="$(basename "$dir")"
            [[ "$n" == "_template" ]] && continue
            [[ ! -f "$dir/.env" ]] && continue

            echo -e "${CYAN}$n:${NC}"
            grep "_PORT=" "$dir/.env" | grep -v "^#" | while IFS='=' read -r key val; do
                printf "  %-25s %s\n" "$key" "$val"
            done
            echo ""
        done
    fi
}

cmd_shell() {
    local name="$1"
    local service="${2:-api}"

    if [[ -z "$name" ]]; then
        log_error "Instance name required"
        exit 1
    fi

    if ! instance_exists "$name"; then
        log_error "Instance '$name' does not exist"
        exit 1
    fi

    local env_file
    env_file=$(get_env_file "$name")

    log_info "Opening shell in $name/$service..."
    docker compose \
        --env-file "$env_file" \
        -f "$PROJECT_ROOT/docker-compose.yml" \
        -p "$name" \
        exec "$service" /bin/sh
}

# ================================
# MAIN
# ================================

if [[ $# -lt 1 ]]; then
    usage
    exit 0
fi

command="$1"
shift

case "$command" in
    create)  cmd_create "$@" ;;
    list)    cmd_list ;;
    start)   cmd_start "$@" ;;
    stop)    cmd_stop "$@" ;;
    destroy) cmd_destroy "$@" ;;
    status)  cmd_status "$@" ;;
    logs)    cmd_logs "$@" ;;
    ports)   cmd_ports "$@" ;;
    shell)   cmd_shell "$@" ;;
    help|-h|--help) usage ;;
    *)
        log_error "Unknown command: $command"
        usage
        exit 1
        ;;
esac
