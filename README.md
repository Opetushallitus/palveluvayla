# palveluvayla

- [Palvelukortti](https://wiki.eduuni.fi/pages/viewpage.action?pageId=494639058)
- [Liityntäpalvelimen vanhenevien varmenteiden uusiminen](https://palveluhallinta.suomi.fi/fi/tuki/artikkelit/592bd1c103f6d100018db5c7)

## Database

Each environment has an Amazon Aurora PostgreSQL cluster, configured in [`createDatabaseCluster`](src/cdk-app.ts). The engine version is configured as PostgreSQL 16.9. The cluster has one writer and one reader, with sizes `db.r8g.xlarge` and `db.r8g.large` respectively.

Both primary and secondary X-Road containers connect to the cluster's writer endpoint through `XROAD_DB_HOST` and `XROAD_DB_PORT`. Application traffic is not routed to the reader endpoint. The reader provides a failover target if the writer becomes unavailable; it has less capacity than the writer.

The database instances run in private isolated VPC subnets, and cluster storage is encrypted. Database access is allowed from the X-Road services, the bastion host, and the operational monitoring metrics Lambda. PostgreSQL logs are exported to CloudWatch Logs.

The database administrator username comes from the SSM parameter `/db/admin`. The generated credentials are stored in the Secrets Manager secret `XroadSecurityServerDatabaseCredentials`. The X-Road containers receive the database password through an ECS secret, while the metrics Lambda reads the connection details from Secrets Manager.

### Log retention

The X-Road images are pinned to version 7.5.1. Database log retention is configured as follows:

| Data                           | Retention | Cleanup frequency |
| ------------------------------ | --------- | ----------------- |
| Message logs                   | 7 days    | Every 12 hours    |
| Operational monitoring records | 7 days    | Every 12 hours    |

CDK sets `MESSAGE_LOG_KEEP_RECORDS_FOR_DAYS=7` on the primary container. This is a repository-specific startup setting: the [`primary Dockerfile`](security-server-nodes/Dockerfile.primary-node) copies [`local.ini`](security-server-nodes/local.ini) into `/etc/xroad/conf.d/local.ini` and appends `[message-log]` with `keep-records-for=7` before starting X-Road. Operational monitoring retention and both cleanup schedules use the X-Road defaults.

Message log cleanup removes eligible timestamped and archived records from the database. It does not delete archive files in `/var/lib/xroad`, which are stored on EFS and have a separate lifecycle.

### Archive files lifecycle

The primary X-Road container archives timestamped message log records every six hours, using the X-Road 7.5.1 default `message-log.archive-interval`. Archives are written under `/var/lib/xroad`, which is mounted from the dedicated `PrimaryNodeArchiveFileSystem` EFS file system. Files persist across container
restarts and replacements. Archiving and database cleanup are separate jobs: records must be timestamped, archived, and older than the configured database retention period before cleanup removes them from the database. See the [X-Road 7.5.1 message log parameters](https://docs.x-road.global/7.5.1/Manuals/ug-syspar_x-road_v6_system_parameters.html#_3-7-message-log-add-on-parameters-message-log).

The archive EFS configuration is the same in all environments:

- Storage is encrypted at rest, and the container's EFS mount uses encryption in transit.
- Automatic EFS backups are enabled.
- `lifecyclePolicy: AFTER_30_DAYS` transitions eligible files from EFS Standard to Infrequent Access (IA) after 30 days without access in Standard. This is a storage cost policy, not an expiry or deletion policy.
- No transition to the EFS Archive storage class or automatic return to Standard on access is configured. X-Road archive files and the EFS Archive storage class are separate concepts. See [EFS lifecycle management](https://docs.aws.amazon.com/efs/latest/ug/lifecycle-management-efs.html).

The EFS archive cleanup described below is separate from database retention: deleting a database record does not remove its archive file, and the database's seven-day retention does not determine how long files stay on EFS. Backup recovery points have their own retention under AWS Backup; this repository enables backups but does not define a custom backup retention policy.

#### Message log retention in the EFS

CDK can create a scheduled ECS Fargate cleanup task for the primary node's archive EFS. It mounts the file system at `/var/lib/xroad` through an EFS access point and scans that directory recursively. The script selects regular files matching `mlog-*.zip` or `mlog-*.zip.gpg` whose filesystem modification time is older than the configured retention period. It does not use the date embedded in the archive filename, remove other file types, or change database records. GNU `find`'s `-mtime` age is based on full 24-hour periods.

Current environment settings in [`config.ts`](src/config.ts) are:

| Environment | EFS cleanup | Configured age | Schedule                      | Mode    |
| ----------- | ----------- | -------------- | ----------------------------- | ------- |
| Dev         | Enabled     | 30 days        | Monthly, 1st day at 02:00 UTC | Dry run |
| QA          | Enabled     | 30 days        | Every 5 minutes               | Dry run |
| Production  | Disabled    | 1,825 days     | Not scheduled                 | Dry run |

In dev and QA, `DRY_RUN=true` means the task reports how many matching files and bytes it found, but does not delete them. To actually remove files, the environment's cleanup must be enabled and `DRY_RUN` changed to `false`; review the findings before doing so. When deletion is enabled, the script removes only the matching files older than the configured age. The task writes to the `/ecs/xroad-log-cleanup` CloudWatch log group, retained for three years, and CDK configures an alarm for stopped ECS tasks. EFS lifecycle transition to Infrequent Access after 30 days is independent of this cleanup and does not delete files.

#### Inspecting the archived files in EFS with AWS CloudShell

The CloudShell VPC ID has been added to the EFS mount target security group as an inbound rule.
You can mount the EFS in CloudShell to inspect the archived files. This requires amazon-efs-utils to be installed in CloudShell.
The following commands will mount the EFS to /mnt/efs and list the files.

`sudo dnf install -y amazon-efs-utils`
`sudo mkdir -p /mnt/efs`

The following command will give the warning "Could not start amazon-efs-mount-watchdog, unrecognized init system "node"", this is ok.
Check the EFS DNS name from the EFS XroadSecurityServerStack/PrimaryNodeArchiveFileSystem filesystem's DNS name, it should start with fs- and end with .efs.<region>.amazonaws.com. Use that in the command below.
Might not work if it has .efs.<region>.amazonaws.com in the end.
`sudo mount -t efs -o tls,ro [EFS DNS name starting with fs-]:/ /mnt/efs`

Check the files exist
`findmnt /mnt/efs`

List the files (Don't do in prod. too many files to list)
`sudo ls -lah /mnt/efs`

Check the oldest start date from the file names
`find /mnt/efs -maxdepth 1 -name 'mlog-*' | sort | head`

Example file name which has currently the oldest start date: `mlog-20241205070349-20260814030958-28b7134f3708e679.zip`
