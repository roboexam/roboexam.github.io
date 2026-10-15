# UniEmbodied-Bench 固定公网入口交接（SZM）

更新时间：2026-08-24（Asia/Shanghai）

> 2026-09-02 治理说明：本文保留 Tailscale 节点身份、文件位置和最初部署证据，
> 不再作为现役启动、发布和健康检查 SOP。现役操作以
> `ops/4090/README.md` 及同目录脚本为准；固定入口已纳入自动部署门禁与
> `unibench-dashboard-watchdog`。Mac 等访问端不需要运行 Tailscale。

> 本文供 Benchmark2027 研究团队运维协作使用。
> Git 版本不包含密码、会话密钥、SSH 私钥、Tailscale state 或证书私钥内容。
> 敏感值以 4090 服务器上的受限配置为准，并由 SZM 通过团队批准的私密渠道交接。

## 1. 当前状态

- 固定主入口：<https://unibench-dashboard.tail4ada12.ts.net/>
- Tailscale Funnel 已开启：HTTPS 443 转发到 `http://127.0.0.1:3100`。
- 公网验收结果：根路径跳转到 `/login`，最终 HTTP 200，TLS 验证成功。
- 看板自身登录认证仍然生效；Funnel 不绕过应用登录。
- Cloudflare Quick Tunnel 保留为应急入口，但其域名是随机的。
- 未删除、移动或覆盖看板代码、实验数据和媒体文件。

## 2. 服务器与代码

```text
4090 / 看板宿主：root@10.40.0.110:6015
A800 开发机：root@10.40.1.76:7165
看板仓库：/mnt/gyc/benchmark2027/dashboard
部署分支：main
部署 commit：af71ef86167cb0f891c53c80725942e455f5b606
本机服务：http://127.0.0.1:3100
看板 tmux：unibench-dashboard
看板日志：/mnt/gyc_ckp/benchmark2027/runtime/dashboard/dashboard.log
```

看板权威敏感配置：

```text
/mnt/gyc_ckp/benchmark2027/runtime/dashboard/dashboard.env
```

该文件当前为 `root:root`、权限 `600`，包含 `AUTH_USERS` 和 `AUTH_SESSION_SECRET`。禁止把它或其中内容提交 Git。团队成员需要密码时，向 SZM 或服务器授权管理员线下领取。

## 3. Tailscale 节点

```text
Tailnet 管理账号：jialininh@gmail.com
MagicDNS suffix：tail4ada12.ts.net
节点名：unibench-dashboard
节点 DNS：unibench-dashboard.tail4ada12.ts.net
Node ID：nC1Mjfk3wA11CNTRL
Node numeric ID：1271903679524907
Node public key：nodekey:dd697e8b2f5445cdcb3c037b65c04ba02e3dd7bc96ecc2752bd58102966ce334
Tailscale IPv4：100.108.227.52
Tailscale IPv6：fd7a:115c:a1e0::9601:e3d1
Key expiry：2027-02-20T12:44:42Z
```

当前节点 key expiry 尚未关闭。若需要在 2027-02-20 后继续使用，应由 tailnet 管理员提前在 Tailscale 管理台关闭该节点的 key expiry，并记录操作人和日期。

本次使用 Google OAuth 注册，没有创建可复用 auth key。

## 4. Tailscale 运行文件

版本：`1.102.3`

```text
运行根：/mnt/gyc_ckp/benchmark2027/runtime/tailscale-unibench
CLI：/mnt/gyc_ckp/benchmark2027/runtime/tailscale-unibench/tailscale_1.102.3_amd64/tailscale
Daemon：/mnt/gyc_ckp/benchmark2027/runtime/tailscale-unibench/tailscale_1.102.3_amd64/tailscaled
状态：/mnt/gyc_ckp/benchmark2027/runtime/tailscale-unibench/state/tailscaled.state
Socket：/tmp/tailscaled-unibench.sock
下载包：/mnt/gyc_ckp/benchmark2027/runtime/tailscale-unibench/downloads/tailscale_1.102.3_amd64.tgz
```

发行包 SHA-256：

```text
36ddd9b51be57ffc2990cf76323cfa13643bfbb1b8a969f6183fa164741cdef5
```

敏感身份文件位置：

```text
/mnt/gyc_ckp/benchmark2027/runtime/tailscale-unibench/state/tailscaled.state
/mnt/gyc_ckp/benchmark2027/runtime/tailscale-unibench/state/certs/acme-account.key.pem
/mnt/gyc_ckp/benchmark2027/runtime/tailscale-unibench/state/certs/unibench-dashboard.tail4ada12.ts.net.key
```

这些文件权限为 `600`。复制其内容等同复制节点身份；泄漏时必须在 Tailscale 管理台移除节点并重新注册。

## 5. 当前进程模型与限制

当前 tmux：

```text
unibench-dashboard
unibench-dashboard-tunnel
unibench-tailscaled
```

宿主环境限制：

- PID 1 是 aibox `agent`，不是 systemd；
- 没有 cron；
- 没有 `/dev/net/tun`；
- 因此 `tailscaled` 使用 `--tun=userspace-networking` 并由 tmux 托管。

固定 URL 和 Funnel 配置会保存在 Tailscale state 中，但宿主或容器重启会清除 tmux，需要人工执行恢复步骤。不要把当前状态描述为“已实现系统级开机自启”。

当前 daemon 命令：

```bash
/mnt/gyc_ckp/benchmark2027/runtime/tailscale-unibench/tailscale_1.102.3_amd64/tailscaled \
  --tun=userspace-networking \
  --state=/mnt/gyc_ckp/benchmark2027/runtime/tailscale-unibench/state/tailscaled.state \
  --statedir=/mnt/gyc_ckp/benchmark2027/runtime/tailscale-unibench/state \
  --socket=/tmp/tailscaled-unibench.sock
```

## 6. 日常检查

登录 4090 后：

```bash
TS_ROOT=/mnt/gyc_ckp/benchmark2027/runtime/tailscale-unibench
TS_BIN=${TS_ROOT}/tailscale_1.102.3_amd64/tailscale
TS_SOCKET=/tmp/tailscaled-unibench.sock

tmux list-sessions
bash /mnt/gyc/benchmark2027/dashboard/ops/4090/status.sh
${TS_BIN} --socket=${TS_SOCKET} status
${TS_BIN} --socket=${TS_SOCKET} funnel status
curl -fsS -L -o /dev/null \
  -w 'http=%{http_code} tls=%{ssl_verify_result} url=%{url_effective}\n' \
  https://unibench-dashboard.tail4ada12.ts.net/
```

健康条件：

- `unibench-dashboard`、`unibench-tailscaled` tmux 存在；
- 看板显示 `Status: healthy`；
- Tailscale 节点在线；
- Funnel 显示 `/ proxy http://127.0.0.1:3100`；
- 公网请求最终 `http=200`、`tls=0`、URL 为 `/login`。

客户端资源校验：

```bash
cd /mnt/gyc/benchmark2027/dashboard
UNIBENCH_NODE_BIN=/mnt/gyc_ckp/benchmark2027/runtime/node/node-v22.14.0-linux-x64/bin/node \
  bash ops/4090/verify-assets.sh \
  https://unibench-dashboard.tail4ada12.ts.net/
```

## 7. 宿主或容器重启后的恢复

### 7.1 恢复看板

```bash
cd /mnt/gyc/benchmark2027/dashboard
bash ops/4090/start.sh
bash ops/4090/status.sh
```

### 7.2 恢复 tailscaled

```bash
TS_ROOT=/mnt/gyc_ckp/benchmark2027/runtime/tailscale-unibench
TS_VERSION_DIR=${TS_ROOT}/tailscale_1.102.3_amd64

tmux has-session -t '=unibench-tailscaled' 2>/dev/null || \
tmux new-session -d -s unibench-tailscaled \
  "exec '${TS_VERSION_DIR}/tailscaled' \
    --tun=userspace-networking \
    --state='${TS_ROOT}/state/tailscaled.state' \
    --statedir='${TS_ROOT}/state' \
    --socket='/tmp/tailscaled-unibench.sock'"
```

等待数秒：

```bash
${TS_VERSION_DIR}/tailscale --socket=/tmp/tailscaled-unibench.sock status
${TS_VERSION_DIR}/tailscale --socket=/tmp/tailscaled-unibench.sock funnel status
```

若 Funnel 没有恢复：

```bash
${TS_VERSION_DIR}/tailscale --socket=/tmp/tailscaled-unibench.sock \
  funnel --bg --https=443 http://127.0.0.1:3100
```

节点专属 Funnel 管理页：

<https://login.tailscale.com/f/funnel?node=nC1Mjfk3wA11CNTRL>

## 8. 停止和恢复 Funnel

只关闭公网入口：

```bash
/mnt/gyc_ckp/benchmark2027/runtime/tailscale-unibench/tailscale_1.102.3_amd64/tailscale \
  --socket=/tmp/tailscaled-unibench.sock funnel --https=443 off
```

恢复固定入口：

```bash
/mnt/gyc_ckp/benchmark2027/runtime/tailscale-unibench/tailscale_1.102.3_amd64/tailscale \
  --socket=/tmp/tailscaled-unibench.sock \
  funnel --bg --https=443 http://127.0.0.1:3100
```

不要删除 state、证书或节点，不要停止未知进程。删除节点和清理 identity 文件必须由负责人单独批准。

## 9. Cloudflare Quick Tunnel 回退

当前应急 URL：

```text
https://truck-ins-matter-screen.trycloudflare.com
```

```bash
cd /mnt/gyc/benchmark2027/dashboard
bash ops/4090/public-status.sh
bash ops/4090/start-public-tunnel.sh
bash ops/4090/stop-public-tunnel.sh
```

`public-status.sh` 只管理 Quick Tunnel，不代表 Tailscale Funnel 状态。不要把 `public-url.txt` 改成 `.ts.net` 地址。

## 10. 看板部署命令

```bash
cd /mnt/gyc/benchmark2027/dashboard
bash ops/4090/status.sh
bash ops/4090/start.sh
bash ops/4090/stop.sh
bash ops/4090/update.sh
tail -n 200 /mnt/gyc_ckp/benchmark2027/runtime/dashboard/dashboard.log
```

`update.sh` 只允许在共享部署 checkout 的 `main` 分支且工作区完全干净时运行。不要在服务运行时手工替换 `dist/client`，也不要从 feature worktree 直接部署。

## 11. 故障定位

固定 URL 无法访问时按以下顺序：

1. `curl http://127.0.0.1:3100/login`，失败则先修看板；
2. 检查 `unibench-tailscaled` tmux；
3. 检查 `tailscale status` 是否在线且没有新的 AuthURL；
4. 检查 `tailscale funnel status` 的 443 和 proxy；
5. 检查节点是否达到 2027-02-20 key expiry；
6. 检查 tailnet Funnel policy 是否被修改。

日志：

```bash
tail -n 200 /mnt/gyc_ckp/benchmark2027/runtime/dashboard/dashboard.log
tmux capture-pane -pt '=unibench-tailscaled':0.0 -S -300
```

已观察到的 UDP buffer size warning 不影响当前 userspace Funnel；公网正常时不要仅因该 warning 重启服务。

## 12. 敏感信息领取和轮换

私密原版由 SZM 本地保管，其 SHA-256 为：

```text
F0BCA1DB62E6A5823F307ADD25FD297C72E85E01B8A990F913589415850259ED
```

需要登录密码或认证会话密钥时：

1. 确认接收人为获授权研究成员；
2. 通过团队批准的私密渠道向 SZM 获取；
3. 在服务器上与 `dashboard.env` 核对；
4. 不把敏感值补写到本仓库、Issue、PR 或 Actions 日志。

若 `AUTH_SESSION_SECRET` 泄漏，应生成新值、更新 `dashboard.env` 并重启看板。若 Tailscale state 或证书私钥泄漏，应从管理台删除节点并重新注册。

## 13. 本次实施记录

- 下载并校验 Tailscale `1.102.3` 静态发行包；
- 使用 userspace networking 启动节点；
- 节点注册为 `unibench-dashboard`；
- tailnet 管理员启用 Funnel；
- 固定入口发布到 `127.0.0.1:3100`；
- 核对 443 HTTPS、proxy handler 和 `AllowFunnel=true`；
- 服务器侧和 SZM 本机侧均验证 `/login` HTTP 200、TLS 正常；
- 保留旧 Quick Tunnel 作为应急入口；
- 未修改看板产品代码或实验结果。

## 14. 参考

- Tailscale Funnel CLI：<https://tailscale.com/docs/reference/tailscale-cli/funnel>
- Tailscale Funnel：<https://tailscale.com/docs/features/tailscale-funnel>
- Tailscale userspace networking：<https://tailscale.com/kb/1112/userspace-networking>
- Cloudflare Quick Tunnel：<https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/>
