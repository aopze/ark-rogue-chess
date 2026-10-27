# 兼容说明（COMPAT）

> 状态：**占位**（`P0.1-2` 建立骨架）。内容待 `M0.5 产品化` 阶段填充。

## 应包含

- 设备矩阵：手机竖屏 / 横屏、平板、桌面
- 浏览器矩阵：iOS Safari、Android Chrome、Telegram WebView
- 已知规避手法（如 iOS 地址栏导致 100vh 抖动、WebView 键盘顶起布局）
- Telegram Mini App 集成点与深链兜底

## 硬约束

产物必须是**离线单文件**（红线 NB-04），不得引入运行时外部依赖 —— 这条决定了兼容性的下限：
能在最朴素的 WebView 里跑起来。
