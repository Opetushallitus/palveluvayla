# palveluvayla

- [Palvelukortti](https://wiki.eduuni.fi/pages/viewpage.action?pageId=494639058)
- [Liityntäpalvelimen vanhenevien varmenteiden uusiminen](https://palveluhallinta.suomi.fi/fi/tuki/artikkelit/592bd1c103f6d100018db5c7)

## Database

Each environment has an Amazon Aurora PostgreSQL cluster, configured in [`createDatabaseCluster`](src/cdk-app.ts). The engine version is configured as PostgreSQL 16.9. The cluster has one writer and one reader:

| Environment | Writer           | Reader           |
| ----------- | ---------------- | ---------------- |
| Dev         | `db.r8g.xlarge`  | `db.r8g.large`   |
| QA          | `db.r8g.xlarge`  | `db.r8g.large`   |
| Production  | `db.r8g.4xlarge` | `db.r8g.4xlarge` |

Both primary and secondary X-Road containers connect to the cluster's writer endpoint through `XROAD_DB_HOST` and `XROAD_DB_PORT`. Application traffic is not routed to the reader endpoint. The reader provides a failover target if the writer becomes unavailable; in dev and QA, it has less capacity than the writer.

The database instances run in private isolated VPC subnets, and cluster storage is encrypted. Database access is allowed from the X-Road services, the bastion host, and the operational monitoring metrics Lambda. PostgreSQL logs are exported to CloudWatch Logs.

The database administrator username comes from the SSM parameter `/db/admin`. The generated credentials are stored in the Secrets Manager secret `XroadSecurityServerDatabaseCredentials`. The X-Road containers receive the database password through an ECS secret, while the metrics Lambda reads the connection details from Secrets Manager.

### Log retention

The X-Road images are pinned to version 7.5.1. Database log retention is configured as follows:

| Data                           | Dev / QA retention | Production retention | Cleanup frequency |
| ------------------------------ | ------------------ | -------------------- | ----------------- |
| Message logs                   | 7 days             | 30 days              | Every 12 hours    |
| Operational monitoring records | 7 days             | 7 days               | Every 12 hours    |

For dev and QA, CDK sets `MESSAGE_LOG_KEEP_RECORDS_FOR_DAYS=7` on the primary container. This is a repository-specific startup setting: the [`primary Dockerfile`](security-server-nodes/Dockerfile.primary-node) copies [`local.ini`](security-server-nodes/local.ini) into `/etc/xroad/conf.d/local.ini` and appends `[message-log]` with `keep-records-for=7` before starting X-Road. Production leaves this setting unset and uses X-Road's default 30-day message log retention. Operational monitoring retention and both cleanup schedules use the X-Road defaults.

Message log cleanup removes eligible timestamped and archived records from the database. It does not delete archive files in `/var/lib/xroad`, which are stored on EFS and have a separate lifecycle.

### Archive files lifecycle

The primary X-Road container archives timestamped message log records every six hours, using the X-Road 7.5.1 default `message-log.archive-interval`. Archives are written under `/var/lib/xroad`, which is mounted from the dedicated `PrimaryNodeArchiveFileSystem` EFS file system. Files persist across container
restarts and replacements. Archiving and database cleanup are separate jobs: records must be timestamped, archived, and older than the configured database retention period before cleanup removes them from the database. See the [X-Road 7.5.1 message log parameters](https://docs.x-road.global/7.5.1/Manuals/ug-syspar_x-road_v6_system_parameters.html#_3-7-message-log-add-on-parameters-message-log).

The archive EFS configuration is the same in all environments:

- Storage is encrypted at rest, and the container's EFS mount uses encryption in transit.
- Automatic EFS backups are enabled.
- `lifecyclePolicy: AFTER_30_DAYS` transitions eligible files from EFS Standard to Infrequent Access (IA) after 30 days without access in Standard. This is a storage cost policy, not an expiry or deletion policy.
- No transition to the EFS Archive storage class or automatic return to Standard on access is configured. X-Road archive files and the EFS Archive storage class are separate concepts. See [EFS lifecycle management](https://docs.aws.amazon.com/efs/latest/ug/lifecycle-management-efs.html).

The repository does not configure scheduled deletion or a maximum retention period for archive files. They remain on EFS until explicitly removed, even after their corresponding database records are cleaned up. Consequently, the seven-day database retention in dev and QA does not limit archive file retention, and archive storage can continue to grow. Backup recovery points have their own retention under AWS Backup; this repository enables backups but does not define a custom backup retention policy.

**NOTE! Message log retention in the EFS is an upcoming feature, will be implemented later**
