# Decision Notes

一套可直接复制进项目的 Skill，用于记录代码和测试无法表达的设计意图、架构边界、跨模块契约、重要技术选型，以及被明确否决的方案。

它不是 ADR 生成器，也不要求每次改动都写文档。Agent 会先检索已有约束，只在未来维护者可能误删、误改或重复讨论某项设计时维护决策笔记。

## 快速开始

### 方式一：复制完整模板

1. 将本仓库内容复制到目标项目根目录。
2. 将 `AGENTS.example.md` 重命名为 `AGENTS.md`；如果项目已有 `AGENTS.md`，只合并其中的“决策笔记”段落。
3. 根据目标项目填写 `AGENTS.md` 中的项目概况、目录和命令，删除所有占位项。
4. 运行 `npm install` 安装校验器所需的开发依赖。
5. 开始开发。`.agents/decisions/` 可以保持为空，首次确有决策需要记录时再新增笔记。

> 目标项目不是 Node.js 项目时，只需复制 `.agents/skills/decision-notes/` 并合并 `AGENTS.example.md` 中的接入片段。校验器是可选工具，不必为了使用 Skill 引入 Node.js。

### 方式二：只接入 Skill

复制以下目录：

```text
.agents/skills/decision-notes/
```

然后把 [AGENTS.example.md](AGENTS.example.md) 中的“最小接入片段”合并到目标项目的 `AGENTS.md`。

## 仓库结构

```text
.agents/
  decisions/                       决策笔记目录（初始为空）
  skills/decision-notes/SKILL.md   Skill 的完整工作规则
scripts/
  verify-decisions.ts              可选的只读校验器
  verify-decisions.test.ts         校验器回归测试
AGENTS.example.md                  目标项目的协作说明模板
verify-decisions-spec.md           校验规则与维护说明
package.json                       校验器命令与开发依赖
```

仓库不包含业务源码、样例数据或示例决策，复制后不会把演示领域混入目标项目。

## 使用方式

开发或评审时，Agent 按 [.agents/skills/decision-notes/SKILL.md](.agents/skills/decision-notes/SKILL.md) 执行：

- 修改已有代码前，检查全局决策、`Applies-To` 路径匹配和代码中的 `Decision:` 反向指针。
- 区分 `proposed`、`accepted`、`rejected` 和 `superseded`，保留仍有价值的历史选择。
- 只记录“为什么”和不能破坏的边界，不把笔记写成工作日志、任务清单或 PR 描述。
- 让决策笔记与对应代码在同一次变更中交付。

决策笔记存放于 `.agents/decisions/`。格式和命名要求以 Skill 为准。

## 可选校验器

要求 Node.js 22 或更高版本：

```sh
npm ci
npm run verify-decisions
npm test
```

严格模式会将 warning 也视为失败：

```sh
npm run verify-decisions -- --strict
```

校验器只读取文件，检查笔记结构、路径、链接、取代关系和代码反向指针，不判断技术决策本身是否正确。完整契约见 [verify-decisions-spec.md](verify-decisions-spec.md)。

## 自定义

通常只需修改 `AGENTS.md` 中与目标项目有关的部分。除非团队需要改变决策笔记的格式或工作流，否则不必修改 Skill。若目标项目使用其他运行时，可以依据规范重写校验器，也可以完全不接入自动校验。

## 贡献

提交变更前运行：

```sh
npm test
npm run verify-decisions -- --strict
```

修改 Skill 规则时，请同步更新校验器、测试及规范中受影响的内容。

## 许可证

[MIT](LICENSE)
