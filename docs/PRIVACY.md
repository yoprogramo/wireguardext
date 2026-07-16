# Privacy Policy — WireGuardExt

**Last updated:** 2026-07-15

WireGuardExt (“the extension”) routes **only the browser's traffic** through a
WireGuard VPN tunnel that **you** configure. This page explains, plainly, what
data the extension handles and where it goes.

> **Summary:** The extension does **not** collect, sell, share, or transmit your
> personal data to the developer or any third party. Your WireGuard credentials
> and profiles are stored **locally** on your device. Network traffic is sent
> **only** to the WireGuard server (peer) that **you** configure.

---

## 1. Data we store (on your device only)

The extension uses `chrome.storage.local` to keep the following information
**on your computer**. It never leaves your device via the extension:

| Data | Purpose | Where |
|---|---|---|
| WireGuard profiles (name, PrivateKey, Address, DNS, MTU, peer PublicKey, Endpoint, AllowedIPs, optional PresharedKey, Keepalive) | The configuration needed to establish **your** VPN tunnel. | `chrome.storage.local` (your browser profile) |
| Active connection state (which profile is active, local SOCKS port, connected/disconnected flag) | Remember the current tunnel state across browser restarts. | `chrome.storage.local` |

These credentials are **required** for the extension to work: they describe
how to reach **your own** WireGuard server.

## 2. Data we do NOT collect

The extension **does not**:

- Collect analytics, usage statistics, or telemetry.
- Collect browsing history, URLs, search queries, or DNS queries.
- Collect personally identifiable information (name, email, IP address, etc.).
- Request authentication or accounts; there is no login.
- Set cookies or use tracking technologies.
- Sell or transfer data to third parties.

## 3. Network traffic

When a tunnel is **active**, the extension configures the browser to route its
traffic through a local SOCKS5 proxy (`127.0.0.1`) provided by the companion
**host application** ([wireproxy](https://github.com/pufferffish/wireproxy)).
That traffic is then encrypted and sent **directly to the WireGuard server
(peer endpoint) you configured** — for example `vpn.example.com:51820`.

The developer of WireGuardExt **never** receives, proxies, inspects, or stores
this traffic. The only network destination is the server you chose.

When the tunnel is **inactive**, the extension routes traffic to a direct
connection (no proxy).

## 4. The companion host application

WireGuardExt requires a small companion program (the “native messaging host”)
that you install separately on your operating system. This host:

- Runs locally on your machine as your user (no administrator/root required).
- Receives the profile configuration from the extension **over Chrome's
  Native Messaging channel** (local inter-process communication; not a
  network socket).
- Starts/stops wireproxy, which establishes the WireGuard tunnel.
- Does **not** include telemetry, auto-update phone-home, or any outbound
  network connection other than the WireGuard tunnel you configured.

## 5. Permissions and why each is required

| Permission | Why it is needed |
|---|---|
| `proxy` | To direct the browser's traffic through the local WireGuard SOCKS5 tunnel, and restore the direct connection when disconnected. |
| `storage` | To save your VPN profiles and connection state locally on your device. |
| `nativeMessaging` | To communicate with the local companion host application that runs wireproxy. |

The extension requests **no** `host_permissions` and does not read or modify
the content of any website.

## 6. Third-party services / open-source components

- [wireproxy](https://github.com/pufferffish/wireproxy) (Apache-2.0): the
  userspace WireGuard client embedded in the companion host. Its own privacy
  characteristics are those of the WireGuard protocol.
- The extension is distributed as open source under the
  [Apache-2.0 license](https://github.com/yoprogramo/wireguardext/blob/main/LICENSE).

## 7. Data retention and deletion

Because all data lives locally in your browser, you can remove it at any time:

- **Delete individual profiles** from the extension's Options page.
- **Remove all data** by uninstalling the extension (this deletes everything
  stored in `chrome.storage.local`), and by removing the companion host
  application from your system.

## 8. Children's privacy

The extension is not directed at children under 16, and no data is knowingly
collected from anyone.

## 9. Changes to this policy

Material changes will be reflected by updating the “Last updated” date above
and publishing the revised version at this same URL.

## 10. Contact

For privacy questions or requests, open an issue at
<https://github.com/yoprogramo/wireguardext/issues>.
