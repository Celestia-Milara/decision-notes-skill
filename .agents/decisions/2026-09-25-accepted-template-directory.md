# Decision: 新项目所需文件镜像到 template/ 目录

Status: accepted
Applies-To: template/**, README.md, .github/workflows/verify.yml

## Context

本仓库同时是自己的使用者（`.agents/decisions/` 里维护着自举笔记）和新项目的模板来源。此前的接入方式是「把仓库内容整个复制过去」，这会把 README、LICENSE 和自举笔记一并带进目标项目，使用者需要手工挑拣删除；留下自举笔记则会让目标项目里出现与自己领域无关的决策。

## Decision

新项目所需的文件——SKILL.md、校验器与回归测试、spec、AGENTS 模板、`package.json` 与 lock、CI workflow、`.gitignore`/`.gitattributes`、空的 `.agents/decisions/`——在 `template/` 下维护一份同步副本，接入时复制 `template/` 的内容而不是整个仓库。根目录与 `template/` 的对应文件必须在同一次变更中一起修改，CI 对每个镜像文件做 diff 兜底；两个 `verify.yml` 是唯一有意不同步的文件（根目录版多一个同步检查步骤）。本地的 `.zcodeignore`（不提交）排除 `template/`，避免镜像副本被重复发现为 skill。

## Alternatives

- **把可分发文件直接移入 template/，根目录不再保留** — 单份拷贝，没有同步成本。未采用：本仓库自己就在使用这套 skill 和校验器，根目录的 `.agents/skills/` 需要保留原件才能被 agent 会话直接发现和触发，dogfooding 不能依赖模板目录。
- **不建目录，README 列清单说明应复制哪些文件** — 零结构改动。未采用：接入仍靠人工挑拣，容易漏带模板文件或多带仓库自用文件。
- **用符号链接代替副本** — 天然无同步问题。未采用：Windows 检出和「复制目录内容」的目标操作对符号链接都不可靠。

## Consequences

- Positive: 接入动作从「复制仓库再删减」变成「复制一个目录」，自举笔记与模板内容不再混淆。
- Positive: 根目录保留全部原件，本仓库的 skill 触发、严格校验与 CI 不受影响。
- Negative: 同一批文件存在两份，改根目录文件时漏改 `template/` 副本只会被 CI 的 diff 检查拦住，本地开发没有即时提示。
- Negative: `template/.github/workflows/verify.yml` 与根目录版本相差一个步骤，同步检查清单必须把它排除在外，是隐性约定。
