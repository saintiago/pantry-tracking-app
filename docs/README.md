# Project documentation

Start with [local setup](../README.md), then choose the guide for the change.

| Document                                                     | Owns                                                      |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| [Product](product.md)                                        | Shipped scope, languages, persistence limits              |
| [Modules](architecture/modules.md)                           | Boundaries, file placement, extension patterns            |
| [Data model](architecture/data-model.md)                     | Persisted records and public API contracts                |
| [Tooling](development/tooling.md)                            | Supported tools and workspace commands                    |
| [Workflow](development/workflow.md)                          | Development, validation and delivery                      |
| [Testing](development/testing.md)                            | Test layers, fixtures and browser patterns                |
| [Deployment](github-deployment.md)                           | AWS/GitHub setup and operations                           |
| [Architecture audit](architecture/audit-2026-09.md)          | Evidence, implemented improvements, remaining risks       |
| [Data-model audit](architecture/data-model-audit-2026-09.md) | Redundancy decisions and observed reconciliation findings |
| [Recovery](development/recovery.md)                          | Isolated restore drill, reconciliation and cutover limits |
| [Feature records](features/README.md)                        | Detailed feature requirements and historical designs      |

`AGENTS.md` owns agent instructions. These guides own maintained facts. Feature records
retain design rationale and acceptance criteria; old task checkboxes are historical.
When changing behavior, update the owning guide and affected feature record together.
Do not copy schemas or agent instructions into new documents. Link to their owner.
Keep transient logs, screenshots and generated reports out of tracked documentation.

The former tool-specific documentation layout has been retired. No Kiro installation
or metadata is needed to work on this project.
