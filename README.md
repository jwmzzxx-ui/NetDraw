# NetDraw 完整使用说明

NetDraw 用来把接口表、路由资源表和组件信息表转换成物理网络图，并同步导出线缆清单、分析报告和图形产物。这个仓库同时包含三部分：

- 命令行处理管线
- 本地后端服务
- 浏览器图形工作台

## 1. 环境要求

- Windows 10/11
- Node.js 18+ 或更高版本
- npm

首次运行前，建议先确认：

```powershell
node -v
npm -v
```

## 2. 安装依赖

在项目根目录 `F:\NetDraw` 打开终端后执行：

```powershell
npm install
```

如果你不想手动安装，也可以直接双击仓库里的批处理文件，缺少依赖时它会自动安装。

## 3. 最常用的启动方式

### 方式 A：同时启动前后端

双击：

- `启动前后端.bat`

或者手动执行：

```powershell
npm run dev
```

默认地址：

- 前端工作台：[http://127.0.0.1:5173](http://127.0.0.1:5173)
- 后端接口：[http://127.0.0.1:3001](http://127.0.0.1:3001)

### 方式 B：只启动网页前端

双击：

- `启动网页.bat`

或者手动执行：

```powershell
npm run web:dev
```

适合只看前端界面、不需要项目登录和导入后端存档时使用。

### 方式 C：只启动后端

```powershell
npm run server:dev
```

默认监听：

- `127.0.0.1:3001`

如需改端口，可设置环境变量：

```powershell
$env:NETDRAW_API_PORT=3002
$env:NETDRAW_API_HOST='127.0.0.1'
npm run server:dev
```

## 4. 网页版完整使用流程

### 4.1 登录

首次启动后，系统会自动创建默认管理员：

- 用户名：`admin`
- 密码：`admin123`

登录页会提示这是默认管理员账号。因为数据库保存在本地 `data/netdraw.sqlite`，只要这个数据库文件还在，账号和项目记录就会持续保留。

### 4.2 选择项目

登录后会进入项目页：

- 管理员可以看到全部项目
- 普通用户只能看到自己被授权的项目
- 管理员可以新建项目

项目创建后，创建者会自动成为该项目管理员成员。

### 4.3 导入数据

进入项目后，左侧有 `Data import` 面板。

导入规则如下：

- `Interface table` 必填，支持 `.csv`、`.xlsx`、`.xls`
- `Routes table` 可选，支持 `.csv`
- `Components table` 可选，支持 `.csv`、`.xlsx`、`.xls`
- `Rules file` 可选，支持 `.json`

点击 `Open import form` 后选择文件，再点 `Start import`。

如果导入成功，页面会自动：

- 加载最新图形
- 更新导入历史
- 显示节点数、逻辑线缆数、路由段数等统计
- 提供下载产物

如果导入失败，左侧统计区域会显示错误信息。常见原因是：

- 接口表缺少必填列
- `row_id` 重复
- 路由引用不存在
- 输入内容触发阻断级校验错误

### 4.4 查看图形

顶部和右侧可用功能包括：

- `Overview`：总览模式，适合看整体结构
- `Detail`：细节模式，显示更完整的线缆和路由段
- `Search`：搜索 cable、device、port
- `Local ELK`：在前端本地重新计算图布局
- `Projects`：返回项目列表
- `Logout`：退出登录

左侧还可以：

- 按 `AC / DC / COMM / SIGNAL / SAFETY` 过滤网络类型
- 查看当前导入统计
- 切换历史导入记录
- 下载生成产物
- 导出手工布局覆盖补丁

### 4.5 Inspector 检查面板

点击节点或边后，右侧 `Inspector` 会显示对应详情：

- 选中线缆边时可查看网络类型、介质、路由字符串
- 选中节点时可查看节点类型和布局说明

选中线缆后还可以点击 `Add bend point` 添加折点，用于人工微调。

### 4.6 导出手工布局覆盖

如果你在图上拖动了节点，或给边增加了折点，左侧 `Manual overrides` 会统计变更数。

点击 `Export overrides` 后会生成一段 JSON 补丁，可回写进规则文件中的布局覆盖配置，便于固定人工调整结果。

## 5. 模板文件怎么用

网页左侧可直接下载模板，模板也在本地目录：

- [samples/templates/interface-template.csv](/F:/NetDraw/samples/templates/interface-template.csv)
- [samples/templates/routes-template.csv](/F:/NetDraw/samples/templates/routes-template.csv)
- [samples/templates/components-template.csv](/F:/NetDraw/samples/templates/components-template.csv)
- [samples/templates/rules-template.json](/F:/NetDraw/samples/templates/rules-template.json)
- [samples/templates/README.md](/F:/NetDraw/samples/templates/README.md)

### 5.1 接口表 `interface-template.csv`

必填列：

- `row_id`
- `src_device`
- `src_board`
- `src_port`
- `dst_device`
- `dst_board`
- `dst_port`
- `net_type`
- `medium`

可选列：

- `cable_id`
- `cable_type`
- `route_hint`
- `redundancy_group`
- `direction`
- `remarks`

`net_type` 允许值：

- `AC`
- `DC`
- `COMM`
- `SIGNAL`
- `SAFETY`

`route_hint` 写法：

- 用 `>` 串联路由锚点，例如 `ROUTE_A>ROUTE_B>ROUTE_C`

### 5.2 路由表 `routes-template.csv`

必填列：

- `from_route_node`
- `to_route_node`

可选列：

- `cost`
- `zone`
- `from_x`
- `from_y`
- `to_x`
- `to_y`
- `capacity`

说明：

- 如果接口表里使用了 `route_hint`，且希望系统自动补全最短路径，就需要提供这张表
- 带坐标的路由表可以支持几何感知的 A* 路由

### 5.3 组件表 `components-template.csv`

必填列：

- `node_id`
- `type`

可选列：

- `layer`
- `cabinet`
- `slot`
- `order`
- `display_name`
- `remarks`

典型 `node_id`：

- `device:DEVICE_A`
- `board:DEVICE_A/BOARD_A`
- `port:DEVICE_A/BOARD_A/PORT_01`

`layer` 允许值：

- `part`
- `breakout`
- `interface`
- `control`
- `switch`
- `ipc`
- `route`

### 5.4 规则文件 `rules-template.json`

规则文件用于控制：

- 归一化别名
- 路由策略
- 布局间距
- 手工覆盖位置
- 边折点
- 样式颜色和线型
- 导出文件名

如果你只是先跑通流程，可以先不提供规则文件。

## 6. 命令行用法

命令行模式适合批量处理、脚本接入、或不经过网页直接产出结果。

### 6.1 最简单示例

```powershell
npm run demo
```

默认会读取：

- `samples/interfaces.csv`

默认输出到：

- `output`

### 6.2 通用命令格式

```powershell
npx tsx src/index.ts --input <接口表> --out <输出目录>
```

可用参数：

- `--input`：接口表路径
- `--components`：组件表路径
- `--routes`：路由表路径
- `--rules`：规则文件路径
- `--out`：输出目录
- `--prefer-astar`：优先使用 A* 路由
- `--export-images`：导出图像
- `--no-png`：导图时不生成 PNG
- `--no-pdf`：导图时不生成 PDF
- `--browser`：指定本机 Chrome/Edge 可执行文件路径
- `--image-width`：导图宽度，默认 `1800`
- `--image-height`：导图高度，默认 `1100`

示例：

```powershell
npx tsx src/index.ts `
  --input samples/interfaces-route-shortcut.csv `
  --routes samples/routes-geometry.csv `
  --rules samples/rules-astar.json `
  --out output/astar-demo `
  --prefer-astar `
  --export-images
```

### 6.3 现成脚本

```powershell
npm run demo
npm run demo:routes
npm run demo:astar
npm run demo:rules
npm run demo:components
npm run demo:aliases
npm run demo:images
```

这些脚本覆盖了常见输入组合，适合快速验证功能。

## 7. 会生成哪些输出文件

一次成功导入或命令行运行后，通常会在输出目录产生这些文件：

- `canonical-graph.json`
- `normalization-report.json`
- `normalization-report.md`
- `validation-report.json`
- `validation-report.md`
- `analysis-report.json`
- `analysis-report.md`
- `model-diagnostics.json`
- `model-diagnostics.md`
- `positioned-graph.json`
- `style-rules.json`
- `legend.json`
- `graph.svg`
- `cable-list.csv`
- `cable-list.xlsx`

启用图像导出时，还可能生成：

- PNG
- PDF

网页版下载区默认记录并提供的主要产物包括：

- `canonical-graph.json`
- `positioned-graph.json`
- `validation-report.json`
- `analysis-report.json`
- `model-diagnostics.json`
- `cable-list.csv`
- `cable-list.xlsx`
- `graph.svg`

## 8. 测试与校验

### 类型检查

```powershell
npm run check
```

### 全量测试

```powershell
npm test
```

### 仅测后端

```powershell
npm run server:test
```

### 校验样例数据

```powershell
npm run verify:samples
```

说明：

- 正常样例必须通过
- 异常样例会按“预期失败”处理

### 生成测试矩阵

```powershell
npm run test:matrix
```

### 5000 线缆基准

```powershell
npm run benchmark
```

自定义参数：

```powershell
npm run benchmark -- --cables 5000 --hops 2 --redundancy 0.1 --loops 0.02 --out output/benchmark
```

更多基准说明见 [docs/testkit.md](/F:/NetDraw/docs/testkit.md)。

## 9. 数据和存档放在哪里

默认数据目录：

- `data`

关键内容：

- `data/netdraw.sqlite`：用户、会话、项目、导入记录数据库
- `data/projects/<projectId>/imports/<importId>/...`：每次导入的原始文件和产物

如果你删除 `data/netdraw.sqlite`：

- 账号会重置
- 默认管理员会重新生成
- 项目记录会丢失

如果你删除某个项目导入目录：

- 对应下载产物可能失效

## 10. 权限规则

- 管理员可以创建项目
- 管理员可以看到所有项目
- 管理员可以创建用户
- 管理员可以把用户加入项目
- 普通用户只能看到自己有权限的项目
- 只要能访问项目，就可以查看该项目导入记录和产物

## 11. 常见问题

### 11.1 网页打不开

先确认前端是否真的启动成功：

```powershell
npm run web:dev
```

正常情况下应该访问：

- [http://127.0.0.1:5173](http://127.0.0.1:5173)

### 11.2 登录后没有项目

可能原因：

- 还没有创建任何项目
- 当前账号不是管理员，且未被加入任何项目

解决方式：

- 用管理员账号创建项目
- 由管理员把当前用户加入项目

### 11.3 导入时报校验错误

先看这些地方：

- 接口表是否缺少必填列
- `row_id` 是否重复
- `net_type` 是否超出允许值
- `route_hint` 是否引用了不存在的路由节点

建议先用模板文件做一份最小可运行样例，再逐步替换成真实数据。

### 11.4 只想快速看效果

可以直接运行：

```powershell
npm run demo
```

或者启动网页后导入仓库里的样例文件：

- [samples/interfaces.csv](/F:/NetDraw/samples/interfaces.csv)
- [samples/routes.csv](/F:/NetDraw/samples/routes.csv)
- [samples/components.csv](/F:/NetDraw/samples/components.csv)
- [samples/rules.json](/F:/NetDraw/samples/rules.json)

### 11.5 图像导出失败

启用 `--export-images` 时，本机会需要可用的 Chrome 或 Edge 无头浏览器环境。必要时可显式指定浏览器路径：

```powershell
npx tsx src/index.ts --input samples/interfaces.csv --out output/image-demo --export-images --browser "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
```

## 12. 推荐的实际使用顺序

如果你是第一次上手，建议按这个顺序：

1. `npm install`
2. 双击 `启动前后端.bat`
3. 用 `admin / admin123` 登录
4. 新建一个项目
5. 下载模板
6. 先导入一份最小接口表
7. 再按需要补充 routes、components、rules
8. 在工作台检查图形和统计
9. 下载 `cable-list.xlsx`、`graph.svg`、`positioned-graph.json` 等产物

## 13. 仓库内的重要位置

- [src/index.ts](/F:/NetDraw/src/index.ts)：命令行入口
- [src/pipeline.ts](/F:/NetDraw/src/pipeline.ts)：核心处理管线
- [server/app.ts](/F:/NetDraw/server/app.ts)：后端接口与导入逻辑
- [server/database.ts](/F:/NetDraw/server/database.ts)：本地数据库与权限逻辑
- [webapp/src/NetDrawApp.tsx](/F:/NetDraw/webapp/src/NetDrawApp.tsx)：登录、项目、导入流程
- [webapp/src/NetDrawWorkbench.tsx](/F:/NetDraw/webapp/src/NetDrawWorkbench.tsx)：工作台交互

如果你要我继续，我可以下一步再补一份“面向最终用户的简化版操作手册”，或者“面向开发者的接口与二次开发说明”。
