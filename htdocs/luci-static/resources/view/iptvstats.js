"use strict";

"require view";
"require rpc";

var callStats = rpc.declare({
    object: "iptvstats",
    method: "stats",
    params: [],
    expect: {}
});

function fmtDur(s) {
    s = Math.round(Number(s) || 0);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    if (h > 0) return h + "小时" + m + "分";
    if (m > 0) return m + "分" + sec + "秒";
    return sec + "秒";
}

// 内网判断：RFC1918 私有地址（A 类 10./ B 类 172.16-31./ C 类 192.168.），IPv6 一律外网
function isInIp(ip) {
    if (ip.indexOf(":") >= 0)
        return false;
    if (ip.indexOf("10.") === 0 || ip.indexOf("192.168.") === 0)
        return true;
    return /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip);
}

function isIn(r) {
    return isInIp(r[0]);
}

function countTop(list, n) {
    var map = {};
    for (var i = 0; i < list.length; i++)
        map[list[i]] = (map[list[i]] || 0) + 1;
    var arr = [];
    for (var k in map)
        arr.push([k, map[k]]);
    arr.sort(function (a, b) { return b[1] - a[1]; });
    return arr.slice(0, n);
}

function groupSum(rows, idxKey, idxVal, filter) {
    var map = {};
    for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (filter && !filter(r))
            continue;
        var k = r[idxKey];
        map[k] = (map[k] || 0) + parseInt(r[idxVal], 10);
    }
    var arr = [];
    for (var k in map)
        arr.push([k, map[k]]);
    arr.sort(function (a, b) { return b[1] - a[1]; });
    return arr;
}

// ===== 弹窗（复刻旧页面：遮罩点击关闭 + × + 锚定定位） =====
var modalMask = null, modalBox = null, modalTitle = null, modalBody = null;

function closeModal() {
    modalMask.style.display = "none";
}

function initModal() {
    modalMask = E("div", { "class": "ip-modal-mask", "style": "display:none" });
    modalBox = E("div", { "class": "ip-modal-box" });
    modalTitle = E("div", { "class": "ip-modal-title" });
    var closeBtn = E("span", { "class": "ip-modal-close" }, "×");
    closeBtn.addEventListener("click", closeModal);
    modalBody = E("div", { "class": "ip-modal-body" });
    modalBox.appendChild(closeBtn);
    modalBox.appendChild(modalTitle);
    modalBox.appendChild(modalBody);
    modalMask.appendChild(modalBox);
    modalMask.addEventListener("click", function (e) {
        if (e.target === modalMask)
            closeModal();
    });
    document.body.appendChild(modalMask);
}

function showModalAt(el, title, lines) {
    modalTitle.textContent = title;
    modalBody.innerHTML = "";
    if (!lines.length) {
        modalBody.appendChild(E("div", { "class": "ip-modal-item" }, "暂无记录"));
    }
    else {
        for (var i = 0; i < lines.length; i++)
            modalBody.appendChild(E("div", { "class": "ip-modal-item" }, (i + 1) + ". " + lines[i]));
    }
    var rect = el.getBoundingClientRect();
    var x = rect.right + 10;
    var y = rect.top;
    modalMask.style.display = "block";
    setTimeout(function () {
        var boxW = modalBox.offsetWidth;
        var boxH = modalBox.offsetHeight;
        if (x + boxW > window.innerWidth)
            x = rect.left - boxW - 10;
        if (y + boxH > window.innerHeight)
            y = window.innerHeight - boxH - 8;
        if (y < 8)
            y = 8;
        modalBox.style.left = x + "px";
        modalBox.style.top = y + "px";
    }, 0);
}

// ===== IP 归属查询（复刻旧页面：api.ip.sb/geoip，结果显示在行内） =====
var ipCache = {};

function queryIpInfo(ip, spanEl, btnEl) {
    if (ipCache[ip]) {
        spanEl.textContent = ipCache[ip];
        return;
    }
    btnEl.disabled = true;
    spanEl.textContent = "查询中...";
    fetch("https://api.ip.sb/geoip/" + encodeURIComponent(ip))
        .then(function (r) { return r.json(); })
        .then(function (j) {
            var info = "";
            if (j && j.isp)
                info = (j.region || "") + " " + (j.city || "") + " " + (j.isp || "");
            else
                info = "无归属信息";
            ipCache[ip] = info;
            spanEl.textContent = info;
        })
        .catch(function () { spanEl.textContent = "查询失败"; })
        .then(function () { btnEl.disabled = false; });
}

// ===== 纯 CSS 条形图 =====
function barRows(items, isDur, inCls) {
    var max = items.length ? items[0][1] : 0;
    var w = E("div", { "class": "ip-bars" });
    for (var i = 0; i < items.length; i++) {
        var pct = max > 0 ? Math.round(items[i][1] / max * 100) : 0;
        w.appendChild(E("div", { "class": "ip-bar-row" }, [
            E("span", { "class": "ip-bar-label" }, items[i][0]),
            E("div", { "class": "ip-bar-track" }, [
                E("div", { "class": inCls ? "ip-bar-fill-in" : "ip-bar-fill-out", "style": "width:" + pct + "%;" })
            ]),
            E("span", { "class": "ip-bar-value" }, isDur ? fmtDur(items[i][1]) : String(items[i][1]))
        ]));
    }
    return w;
}

// ===== 块构建 =====
function ipShouRows(items, withQuery) {
    var list = E("div", {});
    for (var i = 0; i < items.length; i++) {
        (function (it) {
            var ipSpan = E("span", { "class": "ip-link-shou" }, it[0]);
            ipSpan.dataset.ip = it[0];
            var row = E("div", { "class": "ip-item" }, [
                E("span", {}, "IP："), ipSpan,
                E("span", {}, " ｜ 收视时长：" + fmtDur(it[1]) + " ｜ " + it[2] + "个频道")
            ]);
            if (withQuery) {
                var btn = E("button", { "class": "ip-query-btn" }, "查询");
                btn.dataset.ip = it[0];
                var info = E("span", { "class": "ip-info" });
                btn.addEventListener("click", function () { queryIpInfo(it[0], info, btn); });
                row.appendChild(btn);
                row.appendChild(info);
            }
            list.appendChild(row);
        })(items[i]);
    }
    return list;
}

function ipCntRows(items, withQuery) {
    var list = E("div", {});
    for (var i = 0; i < items.length; i++) {
        (function (it) {
            var ipSpan = E("span", { "class": "ip-link" }, it[0]);
            ipSpan.dataset.ip = it[0];
            var row = E("div", { "class": "ip-item" }, [
                E("span", {}, "IP："), ipSpan,
                E("span", {}, " ｜ 次数：" + it[1])
            ]);
            if (withQuery) {
                var btn = E("button", { "class": "ip-query-btn" }, "查询");
                btn.dataset.ip = it[0];
                var info = E("span", { "class": "ip-info" });
                btn.addEventListener("click", function () { queryIpInfo(it[0], info, btn); });
                row.appendChild(btn);
                row.appendChild(info);
            }
            list.appendChild(row);
        })(items[i]);
    }
    return list;
}

function chanShouRows(items, filter) {
    var list = E("div", {});
    for (var i = 0; i < items.length; i++) {
        (function (it) {
            list.appendChild(E("div", { "class": "ip-item ip-item-1" }, [
                E("span", {}, "频道：" + it[0]),
                E("span", {}, " ｜ 收视时长：" + fmtDur(it[1]) + " ｜ " + it[2] + "个IP")
            ]));
        })(items[i]);
    }
    return list;
}

function chanCntRows(items) {
    var list = E("div", {});
    for (var i = 0; i < items.length; i++) {
        (function (it) {
            list.appendChild(E("div", { "class": "ip-item ip-item-1" }, [
                E("span", {}, "频道：" + it[0]),
                E("span", {}, " ｜ 次数：" + it[1])
            ]));
        })(items[i]);
    }
    return list;
}

function box(title, totalText, barItems, isDur, inCls, rows) {
    return E("div", { "class": "ip-box" }, [
        E("h2", {}, title),
        totalText ? E("div", { "class": "ip-total" }, totalText) : null,
        barRows(barItems, isDur, inCls),
        rows
    ]);
}

// ===== 原始记录表（滚动 20 行可视，行号最新最大） =====
function rawSection(RAW_DATA) {
    var wrap = E("div", { "class": "ip-raw-section" });
    var btn = E("button", { "class": "ip-raw-btn" }, "显示原始访问记录");
    var tblWrap = E("div", { "class": "ip-raw-wrap" });
    var loaded = false;
    btn.addEventListener("click", function () {
        if (loaded) {
            if (tblWrap.style.display === "block") {
                tblWrap.style.display = "none";
                btn.textContent = "显示原始访问记录";
            }
            else {
                tblWrap.style.display = "block";
                btn.textContent = "隐藏原始访问记录";
            }
            return;
        }
        tblWrap.style.display = "block";
        btn.textContent = "隐藏原始访问记录";
        var tbl = E("table", { "class": "ip-raw-table" }, [
            E("thead", {}, E("tr", {}, [
                E("th", {}, "#"), E("th", {}, "IP"), E("th", {}, "时间"), E("th", {}, "频道")
            ]))
        ]);
        var tb = E("tbody", {});
        for (var i = 0; i < RAW_DATA.length; i++) {
            tb.appendChild(E("tr", {}, [
                E("td", {}, String(RAW_DATA.length - i)),
                E("td", {}, RAW_DATA[i][0]),
                E("td", {}, RAW_DATA[i][1]),
                E("td", {}, RAW_DATA[i][2])
            ]));
        }
        tbl.appendChild(tb);
        if (!RAW_DATA.length)
            tblWrap.appendChild(E("div", { "style": "padding:8px" }, "暂无原始记录"));
        else
            tblWrap.appendChild(tbl);
        loaded = true;
    });
    wrap.appendChild(btn);
    wrap.appendChild(tblWrap);
    return wrap;
}

function renderPage(res) {
    var RAW_DATA = res.raw || [];
    var SHOUSHI_DATA = res.shoushi || [];

    // ===== 访问维度 =====
    var inIpList = [], outIpList = [], inChanList = [], outChanList = [];
    var ipChanMap = {};
    for (var i = 0; i < RAW_DATA.length; i++) {
        var cols = RAW_DATA[i];
        var ip = cols[0];
        var chan = cols[2];
        if (!ipChanMap[ip])
            ipChanMap[ip] = [];
        ipChanMap[ip].push(chan);
        if (isInIp(ip)) {
            inIpList.push(ip);
            inChanList.push(chan);
        }
        else {
            outIpList.push(ip);
            outChanList.push(chan);
        }
    }
    var inTotal = inIpList.length;
    var outTotal = outIpList.length;

    // ===== 收视维度 =====
    var inIpShouTop5 = groupSum(SHOUSHI_DATA, 0, 1, isIn).slice(0, 5);
    var outIpShouTop5 = groupSum(SHOUSHI_DATA, 0, 1, function (r) { return !isIn(r); }).slice(0, 5);
    var inChanShouTop10 = groupSum(SHOUSHI_DATA, 2, 1, isIn).slice(0, 10);
    var outChanShouTop10 = groupSum(SHOUSHI_DATA, 2, 1, function (r) { return !isIn(r); }).slice(0, 10);
    var inShouTotalSec = 0, outShouTotalSec = 0;
    for (var i = 0; i < SHOUSHI_DATA.length; i++) {
        if (isIn(SHOUSHI_DATA[i]))
            inShouTotalSec += parseInt(SHOUSHI_DATA[i][1], 10);
        else
            outShouTotalSec += parseInt(SHOUSHI_DATA[i][1], 10);
    }

    // ===== 各 TOP 行附加统计（频道数/IP数，按旧页面口径） =====
    function withChanCnt(items) {
        var arr = [];
        for (var i = 0; i < items.length; i++) {
            var cnt = 0;
            for (var j = 0; j < SHOUSHI_DATA.length; j++)
                if (SHOUSHI_DATA[j][0] === items[i][0])
                    cnt++;
            arr.push([items[i][0], items[i][1], cnt]);
        }
        return arr;
    }
    function withIpCnt(items, filter) {
        var arr = [];
        for (var i = 0; i < items.length; i++) {
            var cnt = 0;
            for (var j = 0; j < SHOUSHI_DATA.length; j++)
                if (SHOUSHI_DATA[j][2] === items[i][0] && filter(SHOUSHI_DATA[j]))
                    cnt++;
            arr.push([items[i][0], items[i][1], cnt]);
        }
        return arr;
    }

    var inIpShou = withChanCnt(inIpShouTop5);
    var outIpShou = withChanCnt(outIpShouTop5);
    var inChanShou = withIpCnt(inChanShouTop10, isIn);
    var outChanShou = withIpCnt(outChanShouTop10, function (r) { return !isIn(r); });

    // ===== 8 块：左列内网 / 右列外网（复刻旧页面） =====
    var colLeft = E("div", { "class": "ip-col" }, [
        box("内网IP收视时长 TOP5", "内网IP收视总时长：" + fmtDur(inShouTotalSec), inIpShou, true, true, ipShouRows(inIpShou, false)),
        box("内网频道收视 TOP10", null, inChanShou, true, true, chanShouRows(inChanShou, isIn)),
        box("内网访问IP TOP5", "内网访问总次数：" + inTotal, countTop(inIpList, 5), false, true, ipCntRows(countTop(inIpList, 5), false)),
        box("内网访问频道 TOP10", null, countTop(inChanList, 10), false, true, chanCntRows(countTop(inChanList, 10)))
    ]);
    var colRight = E("div", { "class": "ip-col" }, [
        box("外网IP收视时长 TOP5", "外网IP收视总时长：" + fmtDur(outShouTotalSec), outIpShou, true, false, ipShouRows(outIpShou, true)),
        box("外网频道收视 TOP10", null, outChanShou, true, false, chanShouRows(outChanShou, function (r) { return !isIn(r); })),
        box("外网访问IP TOP5", "外网访问总次数：" + outTotal, countTop(outIpList, 5), false, false, ipCntRows(countTop(outIpList, 5), true)),
        box("外网访问频道 TOP10", null, countTop(outChanList, 10), false, false, chanCntRows(countTop(outChanList, 10)))
    ]);

    var wrap = E("div", { "class": "ip-wrap" }, [colLeft, colRight]);

    // ===== 事件绑定（IP 点击弹窗） =====
    function bindIpLinks(scope, isShou) {
        var els = scope.querySelectorAll(isShou ? ".ip-link-shou" : ".ip-link");
        for (var i = 0; i < els.length; i++) {
            (function (el) {
                el.addEventListener("click", function () {
                    var ip = el.dataset.ip;
                    var lines;
                    if (isShou) {
                        var rows = [];
                        for (var j = 0; j < SHOUSHI_DATA.length; j++)
                            if (SHOUSHI_DATA[j][0] === ip)
                                rows.push([SHOUSHI_DATA[j][2], parseInt(SHOUSHI_DATA[j][1], 10)]);
                        rows.sort(function (a, b) { return b[1] - a[1]; });
                        rows = rows.slice(0, 5);
                        lines = rows.map(function (it) { return it[0] + " ｜ 收视时长：" + fmtDur(it[1]); });
                        showModalAt(el, "IP " + ip + " 收视频道TOP5", lines);
                    }
                    else {
                        var chArr = ipChanMap[ip] || [];
                        var top5 = countTop(chArr, 5);
                        lines = top5.map(function (it) { return it[0] + " ｜ " + it[1] + "次"; });
                        showModalAt(el, "IP " + ip + " 访问频道TOP5", lines);
                    }
                });
            })(els[i]);
        }
    }
    bindIpLinks(colLeft, true);
    bindIpLinks(colRight, true);
    bindIpLinks(colLeft, false);
    bindIpLinks(colRight, false);

    var style = E("style", {}, [
        ".ip-page-title{font-size:24px;font-weight:700;margin:10px 0 14px;padding:10px 16px;text-align:center;background:linear-gradient(90deg,#1f5aa6,#3498db);-webkit-background-clip:text;background-clip:text;color:transparent;display:block}",
        ".ip-wrap{display:grid;grid-template-columns:1fr 1fr;gap:20px;max-width:1400px;margin:0 auto}",
        ".ip-col{display:flex;flex-direction:column}",
        ".ip-col .ip-box{flex:1 1 auto;margin-bottom:20px}",
        ".ip-box{background:#fff;padding:14px 16px;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,.08);border:1px solid #e2e8f0}",
        ".ip-box h2{margin:0 0 6px;color:#1e3a8a;font-size:17px}",
        ".ip-total{padding:5px 0;font-size:15px;font-weight:bold;color:#222}",
        ".ip-msg{font-size:12px;color:#16a34a;padding:2px 0}",
        ".ip-bars{margin:4px 0 2px}",
        ".ip-bar-row{display:flex;align-items:center;margin:2px 0}",
        ".ip-bar-label{width:105px;min-width:105px;font-size:12px;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
        ".ip-bar-track{flex:1;background:#eef2f7;border-radius:6px;height:12px;margin:0 8px;overflow:hidden}",
        ".ip-bar-fill-in{height:100%;background:#39b560;border-radius:6px}",
        ".ip-bar-fill-out{height:100%;background:#4488dd;border-radius:6px}",
        ".ip-bar-value{width:90px;min-width:90px;text-align:right;font-size:12px;color:#555}",
        ".ip-item{padding:4px 0;font-size:15px;line-height:1.45;display:flex;gap:6px;align-items:center;flex-wrap:wrap;height:52px;overflow:hidden}",
        ".ip-item-1{height:30px}",
        ".ip-link,.ip-link-shou{color:#0055cc;text-decoration:underline;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px;display:inline-block;vertical-align:bottom}",
        ".ip-query-btn{font-size:12px;padding:1px 6px;border:1px solid #ccc;background:#eee;border-radius:4px;cursor:pointer;line-height:1.4}",
        ".ip-query-btn:disabled{background:#ddd;cursor:not-allowed}",
        ".ip-info{color:#0066cc;font-size:13px}",
        ".ip-raw-section{width:fit-content;max-width:100%;margin:20px auto 30px;text-align:center}",
        ".ip-raw-btn{padding:8px 20px;border:none;background:#4472c4;color:#fff;border-radius:6px;font-size:15px;cursor:pointer;margin:0 auto;display:block}",
        ".ip-raw-wrap{display:none;margin-top:12px;overflow:auto;max-height:calc(20 * 28px);border:1px solid #ddd;width:fit-content;max-width:100%;margin-left:auto;margin-right:auto}",
        ".ip-raw-table{border-collapse:collapse;width:fit-content;margin:0 auto}",
        ".ip-raw-table th,.ip-raw-table td{border:1px solid #ccc;padding:4px 10px;font-size:14px;white-space:nowrap}",
        ".ip-raw-table th{position:sticky;top:0;background:#eee}",
        ".ip-modal-mask{position:fixed;inset:0;background:rgba(0,0,0,.3);display:none;z-index:999}",
        ".ip-modal-box{position:fixed;background:#fff;padding:20px;border-radius:10px;min-width:320px;max-width:500px;box-shadow:0 4px 16px rgba(0,0,0,.25)}",
        ".ip-modal-title{font-size:17px;font-weight:bold;margin-bottom:12px}",
        ".ip-modal-close{float:right;padding:2px 8px;cursor:pointer;border:1px solid #ccc;background:#eee;border-radius:4px}",
        ".ip-modal-item{padding:3px 0;font-size:15px}",
        "@media (max-width:580px){.ip-wrap{grid-template-columns:1fr}}@media (max-width:600px){.ip-item .ip-link,.ip-item .ip-link-shou{max-width:38vw}.ip-bar-label{width:60px;min-width:60px;font-size:11px}.ip-bar-value{width:44px;min-width:44px;font-size:11px}.ip-item{font-size:12px}.ip-item-1{font-size:12px}.ip-total{font-size:13px}.ip-box h2{font-size:15px}}"
    ].join(""));

    return E("div", { "style": "padding:8px" }, [
        style,
        E("h1", { "class": "ip-page-title" }, "IPTV收视统计"),
        wrap,
        rawSection(RAW_DATA)
    ]);
}

return view.extend({
    render: function () {
        return callStats().then(function (res) {
            initModal();
            return renderPage(res);
        });
    }
});
