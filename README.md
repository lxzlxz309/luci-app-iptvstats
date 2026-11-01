# luci-app-iptvstats（IPTV 收视统计）

独立的 IPTV 收视统计页面，**服务 → IPTV收视统计**：
基于 rtp2httpd access_log（含会话结束日志行）统计各频道/主机的收视时长，
纯 CSS 条形图展示，无需任何图表库。

> ✅ 已在 ImmortalWrt 25.x（aarch64_cortex-a53）实测装机验收，
> 产物 `luci-app-iptvstats-0.apk`（全架构，`LUCI_PKGARCH:=all`）。

## 功能

- **数据来源**：rtp2httpd 的 access_log CSV（格式见下文「运行条件」）。
- **统计呈现**：20 行排行表（带序号，最新最大），纯 CSS 条形图（无 chart.js 等外部库）。
- **内网判定**：按 A/B/C 类保留地址（`10.*` / `172.*` / `192.168.*`）区分内网客户端，
  不计入跨网段统计干扰。
- **后端**：ucode rpcd 插件（`/usr/share/rpcd/ucode/iptvstats`），前端 JS view 同包分发，
  不依赖旧 20086 CGI 入口。

## 运行条件：rtp2httpd 日志输出格式

iptvstats 直接解析 rtp2httpd 的 access_log，**日志必须是逗号分隔的 CSV**，
列顺序固定为：

| 列 | 含义 | 示例 |
| --- | --- | --- |
| 1 | 客户端地址（纯 IP，或 `IP:端口`；IPv6 带 `[ ]` 括号。解析时自动剥离端口/括号） | `192.168.1.5` / `192.168.1.5:34567` |
| 2 | 时间（ISO-8601，含时区偏移） | `2026-10-30T01:06:52+08:00` |
| 3 | **上游组播地址**（`$upstream_url`；`rtp://...`，按 m3u 字典映射为频道名，未命中则显示原样） | `rtp://228.1.1.174:4120` |
| 4（可选） | **会话开始时间**（ISO-8601）——仅会话结束行带此列 | `2026-10-30T01:06:40+08:00` |

- **3 列行 = 会话开始**；**4 列行 = 会话结束**，时长 = 第 2 列 − 第 4 列（精确计算）。
- 只有开始行、没有结束行（如进程崩溃）时走**推断规则**：同一客户端相邻开始行间隔 >60s
  按前置频道计时长；末条距当前时间 >60s 计为"看到现在"（单段时长有上限）。
- 第 4 列由 [lxzlxz309/rtp2httpd](https://github.com/lxzlxz309/rtp2httpd)
  的 **010 补丁**（session-end 日志行）输出，未安装该补丁则全部走推断规则。

### 对应 rtp2httpd 配置（`/etc/config/rtp2httpd`）

```
config instance 'iptv'
    option access_log '/path/to/rtp2httpd-access.csv'
    option log_format '$client_addr,$time_iso8601,$upstream_url'
```

⚠️ **必须显式配置 `log_format` 为逗号分隔的 3 列格式，第 3 列用 `$upstream_url`**
（上游组播地址，m3u 字典按它映射频道名）。rtp2httpd 默认格式
`$client_addr [$time_iso8601] "$service_url" $service_type "$upstream_url"`
带空格/引号/方括号且列序不符，iptvstats **无法解析**。

### m3u 字典（把组播地址映射成频道名）

iptvstats 依赖一个 **m3u 文件做字典**：把日志第 3 列的 `rtp://<组播地址>` 显示成频道名。

**路径**（自动探测，无需配置）：

```
日志同目录的 player.m3u   # 优先：access_log 在 /iptvweb/rtp2httpd-access.csv
                          #      则读取 /iptvweb/player.m3u
/iptvweb/player.m3u       # 回退路径
```

**格式**（标准 m3u）：`#EXTINF` 行写频道名，下一行写任一 `http://.../rtp/<组播地址>` 形式的
播放地址，解析器提取 `/rtp/` 后的地址作为映射键：

```
#EXTINF:-1,CCTV-1 高清
http://192.168.3.149:56309/rtp/228.1.1.174:4120?r2h-token=xxx
#EXTINF:-1,凤凰卫视
http://192.168.3.149:56309/rtp/228.1.1.175:4120
```

→ 日志出现 `rtp://228.1.1.174:4120` 时显示 **CCTV-1 高清**；字典里没有的地址显示原始
`rtp://...` 地址。

## 仓库结构

```
luci-app-iptvstats/
├── Makefile                 # OpenWrt 包定义（LUCI_TITLE / 无外部依赖 / 全架构）
├── htdocs/luci-static/resources/view/iptvstats.js   # 统计页视图（纯 CSS 条形图）
└── root/usr/share/
    ├── luci/menu.d/luci-app-iptvstats.json   # 菜单：服务 → IPTV收视统计
    ├── rpcd/acl.d/luci-app-iptvstats.json    # 访问控制
    └── rpcd/ucode/iptvstats                  # ucode rpcd 后端插件
```

## 使用方法（换环境克隆即编译）

### 1. 前提

- 已就绪的 OpenWrt / ImmortalWrt 编译环境（feeds 已初始化，luci feed 存在）。
- 运行时需 rtp2httpd 主程序（含 010 会话结束日志补丁）并开启其 access_log。

### 2. 克隆到 luci feed 的 applications 目录

```bash
git clone git@github.com:lxzlxz309/luci-app-iptvstats.git <openwrt-src>/feeds/luci/applications/luci-app-iptvstats
```

（独立包，不覆盖任何官方包。）

### 3. 注册到 feeds

```bash
cd <openwrt-src>
./scripts/feeds update -i        # 刷新 feed 索引
./scripts/feeds install luci-app-iptvstats
```

### 4. 配置（menuconfig）

```bash
make menuconfig
# 进入 LuCI → Applications → luci-app-iptvstats
#   按 Y：编入固件 / 按 M：编成独立安装包（推荐）
```

> 只想单独出包可跳过 menuconfig，直接执行第 5 步。

### 5. 单独编译

```bash
make package/luci-app-iptvstats/compile V=s
```

产物路径：

```
bin/packages/<目标架构>/luci/luci-app-iptvstats-0.apk
# 例：bin/packages/aarch64_cortex-a53/luci/luci-app-iptvstats-0.apk
```

（传统 ipk 固件输出在 `bin/packages/<架构>/luci/luci-app-iptvstats_0_all.ipk`。）

### 6. 编入固件（可选）

menuconfig 按 `Y` 后整体 `make V=s`。

## 说明

- 自研独立包（无上游），后端 ucode + 前端 JS view 同包分发，不依赖旧 20086 入口。
- 收视时长算法与统计口径基于 rtp2httpd access_log 的会话结束日志行（见主程序仓库差异表）。
