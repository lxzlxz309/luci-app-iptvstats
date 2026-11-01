# luci-app-iptvstats（IPTV 收视统计）

独立的 IPTV 收视统计页面，**服务 → IPTV收视统计**：
基于 rtp2httpd access_log（含会话结束日志行）统计各频道/主机的收视时长，
纯 CSS 条形图展示，无需任何图表库。

> ✅ 已在 ImmortalWrt 25.x（aarch64_cortex-a53）实测装机验收，
> 产物 `luci-app-iptvstats-0.apk`（全架构，`LUCI_PKGARCH:=all`）。

## 功能

- **数据来源**：rtp2httpd 的 access_log CSV（需在 rtp2httpd 配置中启用
  `access_log`，并配合 [lxzlxz309/rtp2httpd](https://github.com/lxzlxz309/rtp2httpd)
  的 010 补丁——日志末列带会话开始时间戳，用于精确计算收视时长）。
- **统计呈现**：20 行排行表（带序号，最新最大），纯 CSS 条形图（无 chart.js 等外部库）。
- **内网判定**：按 A/B/C 类保留地址（`10.*` / `172.*` / `192.168.*`）区分内网客户端，
  不计入跨网段统计干扰。
- **后端**：ucode rpcd 插件（`/usr/share/rpcd/ucode/iptvstats`），前端 JS view 同包分发，
  不依赖旧 20086 CGI 入口。

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
