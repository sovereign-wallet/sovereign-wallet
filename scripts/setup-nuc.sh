#!/bin/bash
# =============================================================================
# Sovereign Wallet — NUC Setup
# Installs and configures: Bitcoin Core, Fulcrum, Tor, WireGuard
# Run on a dedicated Ubuntu 20.04+ machine with sudo access.
# =============================================================================
set -e

FULCRUM_PORT="50002"
WG_PORT="51820"
WG_SUBNET="10.0.0"
BITCOIN_VERSION="27.1"
FULCRUM_VERSION="1.11.1"

# ── Checks ──

if [ "$(id -u)" -eq 0 ]; then
  echo "[ERROR] Do not run as root. Run as a regular user with sudo access."
  exit 1
fi

if ! command -v sudo &> /dev/null; then
  echo "[ERROR] sudo is required. Install it first."
  exit 1
fi

source /etc/os-release 2>/dev/null || true
if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
  echo "[WARNING] This script is designed for Ubuntu/Debian. Proceed with caution."
fi

echo "=== Sovereign Wallet — NUC Setup ==="
echo "This will install: Bitcoin Core, Fulcrum, Tor, WireGuard"
echo ""
read -p "Continue? [y/N] " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then exit 0; fi

# ── 1. Bitcoin Core ──
echo ""
echo "[1/5] Bitcoin Core ${BITCOIN_VERSION}..."

if command -v bitcoind &> /dev/null; then
  echo "  Already installed: $(bitcoind --version | head -1)"
else
  sudo mkdir -p /data/bitcoin
  sudo chown $USER:$USER /data/bitcoin

  ARCH=$(uname -m)
  if [ "$ARCH" = "x86_64" ]; then
    BTC_ARCH="x86_64-linux-gnu"
  elif [ "$ARCH" = "aarch64" ]; then
    BTC_ARCH="aarch64-linux-gnu"
  else
    echo "[ERROR] Unsupported architecture: $ARCH"
    exit 1
  fi

  wget -q "https://bitcoincore.org/bin/bitcoin-core-${BITCOIN_VERSION}/bitcoin-${BITCOIN_VERSION}-${BTC_ARCH}.tar.gz"
  tar xzf "bitcoin-${BITCOIN_VERSION}-${BTC_ARCH}.tar.gz"
  sudo install -m 0755 "bitcoin-${BITCOIN_VERSION}/bin/"* /usr/local/bin/
  rm -rf "bitcoin-${BITCOIN_VERSION}" "bitcoin-${BITCOIN_VERSION}-${BTC_ARCH}.tar.gz"

  # bitcoin.conf
  if [ ! -f /data/bitcoin/bitcoin.conf ]; then
    RPC_PASS=$(openssl rand -hex 16)
    cat > /data/bitcoin/bitcoin.conf << EOF
# Sovereign Wallet — Bitcoin Core configuration
server=1
txindex=1
datadir=/data/bitcoin
rpcuser=sovereign
rpcpassword=${RPC_PASS}
rpcallowip=127.0.0.1
zmqpubrawblock=tcp://127.0.0.1:28332
zmqpubrawtx=tcp://127.0.0.1:28333
dbcache=2048
maxconnections=40
EOF
    echo "  Created /data/bitcoin/bitcoin.conf (rpcpassword: ${RPC_PASS})"
  else
    echo "  bitcoin.conf already exists, skipping"
  fi

  # systemd service
  sudo tee /etc/systemd/system/bitcoind.service > /dev/null << EOF
[Unit]
Description=Bitcoin Core
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/local/bin/bitcoind -conf=/data/bitcoin/bitcoin.conf
Type=forking
User=$USER
Restart=on-failure
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable bitcoind
  echo "  [OK] Bitcoin Core installed. Start with: sudo systemctl start bitcoind"
fi

# ── 2. Fulcrum ──
echo ""
echo "[2/5] Fulcrum ${FULCRUM_VERSION}..."

if command -v Fulcrum &> /dev/null; then
  echo "  Already installed"
else
  sudo mkdir -p /data/fulcrum
  sudo chown $USER:$USER /data/fulcrum

  ARCH=$(uname -m)
  if [ "$ARCH" = "x86_64" ]; then
    FL_ARCH="x86_64-linux-gnu"
  else
    FL_ARCH="arm64-linux-gnu"
  fi

  wget -q "https://github.com/cculianu/Fulcrum/releases/download/v${FULCRUM_VERSION}/Fulcrum-${FULCRUM_VERSION}-${FL_ARCH}.tar.gz"
  tar xzf "Fulcrum-${FULCRUM_VERSION}-${FL_ARCH}.tar.gz"
  sudo cp "Fulcrum-${FULCRUM_VERSION}-${FL_ARCH}/Fulcrum" /usr/local/bin/
  sudo chmod +x /usr/local/bin/Fulcrum
  rm -rf "Fulcrum-${FULCRUM_VERSION}-${FL_ARCH}" "Fulcrum-${FULCRUM_VERSION}-${FL_ARCH}.tar.gz"

  # Generate SSL certificate
  if [ ! -f /data/fulcrum/cert.pem ]; then
    openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:secp384r1 \
      -days 3650 -nodes -subj "/CN=Fulcrum" \
      -keyout /data/fulcrum/key.pem -out /data/fulcrum/cert.pem 2>/dev/null
    echo "  Generated SSL certificate"
  fi

  # Read RPC password from bitcoin.conf
  RPC_PASS=$(grep rpcpassword /data/bitcoin/bitcoin.conf 2>/dev/null | cut -d= -f2 || echo "CHANGE_ME")

  if [ ! -f /data/fulcrum/fulcrum.conf ]; then
    cat > /data/fulcrum/fulcrum.conf << EOF
# Sovereign Wallet — Fulcrum configuration
datadir = /data/fulcrum/db
bitcoind = 127.0.0.1:8332
rpcuser = sovereign
rpcpassword = ${RPC_PASS}
ssl = 0.0.0.0:${FULCRUM_PORT}
cert = /data/fulcrum/cert.pem
key = /data/fulcrum/key.pem
peering = false
fast-sync = 2048
EOF
    mkdir -p /data/fulcrum/db
    echo "  Created /data/fulcrum/fulcrum.conf"
  fi

  # systemd service (disabled by default — enable after Bitcoin Core syncs)
  sudo tee /etc/systemd/system/fulcrum.service > /dev/null << EOF
[Unit]
Description=Fulcrum Electrum Server
After=bitcoind.service
Requires=bitcoind.service

[Service]
ExecStart=/usr/local/bin/Fulcrum /data/fulcrum/fulcrum.conf
Restart=on-failure
User=$USER

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  echo "  [OK] Fulcrum installed. Enable AFTER Bitcoin Core syncs:"
  echo "       sudo systemctl enable --now fulcrum"
fi

# ── 3. Tor ──
echo ""
echo "[3/5] Tor..."

if command -v tor &> /dev/null; then
  echo "  Already installed"
else
  sudo apt-get update -qq
  sudo apt-get install -y -qq tor
fi

# Add hidden service for Fulcrum if not already configured
if ! grep -q "HiddenServiceDir.*fulcrum" /etc/tor/torrc 2>/dev/null; then
  sudo tee -a /etc/tor/torrc > /dev/null << EOF

# Sovereign Wallet — Fulcrum hidden service
HiddenServiceDir /var/lib/tor/fulcrum/
HiddenServicePort ${FULCRUM_PORT} 127.0.0.1:${FULCRUM_PORT}
EOF
  sudo systemctl restart tor
  sleep 2
  echo "  [OK] Tor hidden service configured"
fi

ONION=$(sudo cat /var/lib/tor/fulcrum/hostname 2>/dev/null || echo "not available yet")
echo "  Onion address: ${ONION}"

# ── 4. WireGuard ──
echo ""
echo "[4/5] WireGuard..."

if command -v wg &> /dev/null; then
  echo "  Already installed"
else
  sudo apt-get install -y -qq wireguard
fi

if [ ! -f /etc/wireguard/wg0.conf ]; then
  # Generate server keys
  umask 077
  wg genkey | sudo tee /etc/wireguard/server_private.key | wg pubkey | sudo tee /etc/wireguard/server_public.key > /dev/null

  SERVER_PRIVKEY=$(sudo cat /etc/wireguard/server_private.key)
  SERVER_PUBKEY=$(sudo cat /etc/wireguard/server_public.key)

  # Detect primary network interface
  IFACE=$(ip route show default | awk '/default/ {print $5}' | head -1)

  sudo tee /etc/wireguard/wg0.conf > /dev/null << EOF
[Interface]
PrivateKey = ${SERVER_PRIVKEY}
Address = ${WG_SUBNET}.1/24
ListenPort = ${WG_PORT}
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o ${IFACE} -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o ${IFACE} -j MASQUERADE
EOF

  # Enable IP forwarding
  echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf > /dev/null
  sudo sysctl -p -q

  sudo systemctl enable wg-quick@wg0
  sudo systemctl start wg-quick@wg0
  echo "  [OK] WireGuard configured"
  echo "  Server public key: ${SERVER_PUBKEY}"
else
  SERVER_PUBKEY=$(sudo cat /etc/wireguard/server_public.key 2>/dev/null || echo "unknown")
  echo "  wg0.conf already exists"
fi

# ── 5. Firewall ──
echo ""
echo "[5/5] UFW Firewall..."

if command -v ufw &> /dev/null; then
  sudo ufw allow 22/tcp comment "SSH" 2>/dev/null || true
  sudo ufw allow 8333/tcp comment "Bitcoin P2P" 2>/dev/null || true
  sudo ufw allow ${FULCRUM_PORT}/tcp comment "Fulcrum SSL" 2>/dev/null || true
  sudo ufw allow ${WG_PORT}/udp comment "WireGuard" 2>/dev/null || true
  sudo ufw --force enable 2>/dev/null || true
  echo "  [OK] UFW configured"
else
  echo "  UFW not installed, skipping firewall setup"
fi

# ── Summary ──
echo ""
echo "============================================"
echo "  Sovereign Wallet — NUC Setup Complete"
echo "============================================"
echo ""
echo "  Bitcoin Core:  /data/bitcoin/bitcoin.conf"
echo "                 sudo systemctl start bitcoind"
echo "                 (Sync takes 12-18 hours)"
echo ""
echo "  Fulcrum:       /data/fulcrum/fulcrum.conf"
echo "                 Enable AFTER Bitcoin Core syncs:"
echo "                 sudo systemctl enable --now fulcrum"
echo "                 SSL: wss://$(hostname -I | awk '{print $1}'):${FULCRUM_PORT}"
echo ""
echo "  Tor:           ${ONION}"
echo ""
echo "  WireGuard:     $(hostname -I | awk '{print $1}'):${WG_PORT}"
echo "                 Public key: ${SERVER_PUBKEY}"
echo ""
echo "  Check status:  sudo systemctl status bitcoind fulcrum tor wg-quick@wg0"
echo ""
echo "  IMPORTANT: Update your .env file with:"
echo "  VITE_DEFAULT_NODE_URL=wss://$(hostname -I | awk '{print $1}'):${FULCRUM_PORT}"
echo "  VITE_WIREGUARD_PUBLIC_KEY=${SERVER_PUBKEY}"
echo ""
