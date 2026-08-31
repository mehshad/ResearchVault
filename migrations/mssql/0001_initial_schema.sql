-- ResearchVault — SQL Server (T-SQL) initial schema
-- Equivalent of migrations/0000_nappy_vivisector.sql and subsequent migration files.
--
-- Key type mappings from PostgreSQL:
--   serial            → INT IDENTITY(1,1)
--   text              → NVARCHAR(MAX)
--   boolean           → BIT
--   timestamp         → DATETIME2
--   date              → DATE
--   json / jsonb      → NVARCHAR(MAX)   (use JSON_VALUE() / JSON_QUERY() to query inside)
--   integer[]         → NVARCHAR(MAX)   (stored as JSON array string e.g. '[1,2,3]')
--   text[]            → NVARCHAR(MAX)   (stored as JSON array string)
--   now()             → GETUTCDATE()
--   gen_random_uuid() → NEWID()

-- ── Prevent re-running on an already-initialised database ─────────────────────
IF OBJECT_ID(N'dbo.users', N'U') IS NOT NULL
BEGIN
  PRINT 'Schema already exists — skipping 0001_initial_schema.sql';
  -- Comment out the RETURN below if you want to force re-run (idempotent statements follow)
  RETURN;
END;
GO

-- ── users ─────────────────────────────────────────────────────────────────────
CREATE TABLE [dbo].[users] (
  [id]         INT IDENTITY(1,1) PRIMARY KEY NOT NULL,
  [username]   NVARCHAR(MAX) NOT NULL,
  [password]   NVARCHAR(MAX) NOT NULL,
  [name]       NVARCHAR(MAX) NOT NULL,
  [email]      NVARCHAR(MAX) NOT NULL,
  [role]       NVARCHAR(MAX) NOT NULL DEFAULT 'user',
  [created_at] DATETIME2     DEFAULT GETUTCDATE(),
  [updated_at] DATETIME2     DEFAULT GETUTCDATE(),
  CONSTRAINT [users_username_unique] UNIQUE ([username])
);
GO

-- ── scientists ────────────────────────────────────────────────────────────────
CREATE TABLE [dbo].[scientists] (
  [id]                     INT IDENTITY(1,1) PRIMARY KEY NOT NULL,
  [name]                   NVARCHAR(MAX),
  [first_name]             NVARCHAR(MAX),
  [last_name]              NVARCHAR(MAX),
  [honorific_title]        NVARCHAR(MAX),
  [email]                  NVARCHAR(MAX) NOT NULL,
  [department]             NVARCHAR(MAX),
  [department_id]          INT,
  [section_id]             INT,
  [bio]                    NVARCHAR(MAX),
  [profile_image_initials] NVARCHAR(MAX),
  [supervisor_id]          INT,
  [staff_id]               NVARCHAR(MAX),
  [staff_type]             NVARCHAR(MAX),
  [job_title]              NVARCHAR(MAX),
  [orcid_id]               NVARCHAR(MAX),
  [linkedin_url]           NVARCHAR(MAX),
  [google_scholar_url]     NVARCHAR(MAX),
  [web_of_science_id]      NVARCHAR(MAX),
  [is_investigator]        BIT           DEFAULT 0,
  [created_at]             DATETIME2     DEFAULT GETUTCDATE(),
  [updated_at]             DATETIME2     DEFAULT GETUTCDATE(),
  CONSTRAINT [scientists_email_unique] UNIQUE ([email])
);
GO

-- ── programs ──────────────────────────────────────────────────────────────────
CREATE TABLE [dbo].[programs] (
  [id]          INT IDENTITY(1,1) PRIMARY KEY NOT NULL,
  [program_id]  NVARCHAR(MAX) NOT NULL,
  [name]        NVARCHAR(MAX) NOT NULL,
  [description] NVARCHAR(MAX),
  [created_at]  DATETIME2 DEFAULT GETUTCDATE(),
  [updated_at]  DATETIME2 DEFAULT GETUTCDATE(),
  CONSTRAINT [programs_program_id_unique] UNIQUE ([program_id])
);
GO

-- ── project_groups (formerly sections) ───────────────────────────────────────
CREATE TABLE [dbo].[project_groups] (
  [id]               INT IDENTITY(1,1) PRIMARY KEY NOT NULL,
  [project_group_id] NVARCHAR(MAX) NOT NULL,
  [program_id]       INT,
  [name]             NVARCHAR(MAX) NOT NULL,
  [description]      NVARCHAR(MAX),
  [lead_scientist_id] INT,
  [created_at]       DATETIME2 DEFAULT GETUTCDATE(),
  [updated_at]       DATETIME2 DEFAULT GETUTCDATE(),
  CONSTRAINT [project_groups_project_group_id_unique] UNIQUE ([project_group_id])
);
GO

-- ── research_activities ───────────────────────────────────────────────────────
CREATE TABLE [dbo].[research_activities] (
  [id]                           INT IDENTITY(1,1) PRIMARY KEY NOT NULL,
  [sdr_number]                   NVARCHAR(MAX) NOT NULL,
  [project_group_id]             INT,
  [title]                        NVARCHAR(MAX) NOT NULL,
  [short_title]                  NVARCHAR(MAX),
  [description]                  NVARCHAR(MAX),
  [status]                       NVARCHAR(MAX) NOT NULL DEFAULT 'planning',
  [start_date]                   DATETIME2,
  [end_date]                     DATETIME2,
  [lead_pi_id]                   INT,
  [budget_holder_id]             INT,
  [line_manager_id]              INT,
  [additional_notification_email] NVARCHAR(MAX),
  [sidra_branch]                 NVARCHAR(MAX),
  [budget_source]                NVARCHAR(MAX),
  [objectives]                   NVARCHAR(MAX),
  [created_at]                   DATETIME2 DEFAULT GETUTCDATE(),
  [updated_at]                   DATETIME2 DEFAULT GETUTCDATE(),
  CONSTRAINT [research_activities_sdr_number_unique] UNIQUE ([sdr_number])
);
GO

-- ── project_members ───────────────────────────────────────────────────────────
CREATE TABLE [dbo].[project_members] (
  [id]                   INT IDENTITY(1,1) PRIMARY KEY NOT NULL,
  [research_activity_id] INT NOT NULL,
  [scientist_id]         INT NOT NULL,
  [role]                 NVARCHAR(MAX),
  CONSTRAINT [project_scientist_idx] UNIQUE ([research_activity_id], [scientist_id])
);
GO

-- ── publications ──────────────────────────────────────────────────────────────
CREATE TABLE [dbo].[publications] (
  [id]                              INT IDENTITY(1,1) PRIMARY KEY NOT NULL,
  [research_activity_id]            INT,
  [title]                           NVARCHAR(MAX) NOT NULL,
  [abstract]                        NVARCHAR(MAX),
  [authors]                         NVARCHAR(MAX),          -- nullable per 20260826 migration
  [journal]                         NVARCHAR(MAX),
  [volume]                          NVARCHAR(MAX),
  [issue]                           NVARCHAR(MAX),
  [pages]                           NVARCHAR(MAX),
  [doi]                             NVARCHAR(MAX),
  [pmid]                            NVARCHAR(MAX),
  [publication_date]                DATETIME2,
  [publication_type]                NVARCHAR(MAX),
  [status]                          NVARCHAR(MAX),
  [impact_factor]                   FLOAT,
  [impact_factor_source]            NVARCHAR(MAX),
  [alternate_dois]                  NVARCHAR(MAX),          -- JSON array
  [vetted_for_submission_by_ip_office] BIT DEFAULT 0,
  [submitted_to_journal_at]         DATETIME2,
  [invalid_reason]                  NVARCHAR(MAX),
  [created_by_user_id]              INT,
  [created_at]                      DATETIME2 DEFAULT GETUTCDATE(),
  [updated_at]                      DATETIME2 DEFAULT GETUTCDATE()
);
GO

-- ── irb_applications ──────────────────────────────────────────────────────────
CREATE TABLE [dbo].[irb_applications] (
  [id]                             INT IDENTITY(1,1) PRIMARY KEY NOT NULL,
  [research_activity_id]           INT,
  [irb_number]                     NVARCHAR(MAX) NOT NULL,
  [irb_net_number]                 NVARCHAR(MAX),
  [old_number]                     NVARCHAR(MAX),
  [title]                          NVARCHAR(MAX) NOT NULL,
  [short_title]                    NVARCHAR(MAX),
  [principal_investigator_id]      INT NOT NULL,
  [additional_notification_email]  NVARCHAR(MAX),
  [protocol_type]                  NVARCHAR(MAX),
  [is_interventional]              BIT DEFAULT 0,
  [submission_date]                DATETIME2,
  [initial_approval_date]          DATE,
  [expiration_date]                DATE,
  [status]                         NVARCHAR(MAX) NOT NULL,
  [subject_enrollment_reasons]     NVARCHAR(MAX),           -- JSON array
  [description]                    NVARCHAR(MAX),
  [documents]                      NVARCHAR(MAX),           -- JSON
  [created_at]                     DATETIME2 DEFAULT GETUTCDATE(),
  [updated_at]                     DATETIME2 DEFAULT GETUTCDATE(),
  CONSTRAINT [irb_applications_irb_number_unique] UNIQUE ([irb_number])
);
GO

-- ── ibc_applications ──────────────────────────────────────────────────────────
CREATE TABLE [dbo].[ibc_applications] (
  [id]                        INT IDENTITY(1,1) PRIMARY KEY NOT NULL,
  [research_activity_id]      INT,
  [ibc_number]                NVARCHAR(MAX) NOT NULL,
  [cayuse_protocol_number]    NVARCHAR(MAX),
  [title]                     NVARCHAR(MAX) NOT NULL,
  [principal_investigator_id] INT NOT NULL,
  [submission_date]           DATETIME2,
  [approval_date]             DATE,
  [expiration_date]           DATE,
  [status]                    NVARCHAR(MAX) NOT NULL,
  [documents]                 NVARCHAR(MAX),               -- JSON
  [people_involved]           NVARCHAR(MAX),               -- JSON array of int
  [created_at]                DATETIME2 DEFAULT GETUTCDATE(),
  [updated_at]                DATETIME2 DEFAULT GETUTCDATE(),
  CONSTRAINT [ibc_applications_ibc_number_unique] UNIQUE ([ibc_number])
);
GO

-- ── research_contracts ────────────────────────────────────────────────────────
CREATE TABLE [dbo].[research_contracts] (
  [id]                         INT IDENTITY(1,1) PRIMARY KEY NOT NULL,
  [research_activity_id]       INT,
  [contract_number]            NVARCHAR(MAX) NOT NULL,
  [title]                      NVARCHAR(MAX) NOT NULL,
  [lead_pi_id]                 INT,
  [irb_protocol]               NVARCHAR(MAX),
  [qnrf_number]                NVARCHAR(MAX),
  [request_state]              NVARCHAR(MAX),
  [start_date]                 DATE,
  [end_date]                   DATE,
  [remarks]                    NVARCHAR(MAX),
  [funding_source_category]    NVARCHAR(MAX),
  [contractor_name]            NVARCHAR(MAX),
  [internal_cost_sidra]        INT,
  [internal_cost_counterparty] INT,
  [money_out]                  INT,
  [is_po_relevant]             BIT DEFAULT 0,
  [contract_type]              NVARCHAR(MAX),
  [status]                     NVARCHAR(MAX) NOT NULL,
  [description]                NVARCHAR(MAX),
  [documents]                  NVARCHAR(MAX),              -- JSON
  [created_at]                 DATETIME2 DEFAULT GETUTCDATE(),
  [updated_at]                 DATETIME2 DEFAULT GETUTCDATE(),
  CONSTRAINT [research_contracts_contract_number_unique] UNIQUE ([contract_number])
);
GO

-- ── patents ───────────────────────────────────────────────────────────────────
CREATE TABLE [dbo].[patents] (
  [id]                   INT IDENTITY(1,1) PRIMARY KEY NOT NULL,
  [research_activity_id] INT,
  [title]                NVARCHAR(MAX) NOT NULL,
  [inventors]            NVARCHAR(MAX) NOT NULL,
  [filing_date]          DATETIME2,
  [grant_date]           DATETIME2,
  [patent_number]        NVARCHAR(MAX),
  [status]               NVARCHAR(MAX) NOT NULL,
  [description]          NVARCHAR(MAX),
  [created_at]           DATETIME2 DEFAULT GETUTCDATE(),
  [updated_at]           DATETIME2 DEFAULT GETUTCDATE()
);
GO

-- ── data_management_plans ─────────────────────────────────────────────────────
CREATE TABLE [dbo].[data_management_plans] (
  [id]                     INT IDENTITY(1,1) PRIMARY KEY NOT NULL,
  [research_activity_id]   INT NOT NULL,
  [title]                  NVARCHAR(MAX) NOT NULL,
  [description]            NVARCHAR(MAX),
  [data_collection_methods] NVARCHAR(MAX),
  [data_storage_plan]      NVARCHAR(MAX),
  [data_sharing_plan]      NVARCHAR(MAX),
  [retention_period]       NVARCHAR(MAX),
  [created_at]             DATETIME2 DEFAULT GETUTCDATE(),
  [updated_at]             DATETIME2 DEFAULT GETUTCDATE()
);
GO

-- ── grants ────────────────────────────────────────────────────────────────────
CREATE TABLE [dbo].[grants] (
  [id]                   INT IDENTITY(1,1) PRIMARY KEY NOT NULL,
  [research_activity_id] INT,
  [project_number]       NVARCHAR(MAX) NOT NULL,
  [title]                NVARCHAR(MAX),
  [funder]               NVARCHAR(MAX),
  [amount]               BIGINT,
  [start_date]           DATE,
  [end_date]             DATE,
  [status]               NVARCHAR(MAX),
  [description]          NVARCHAR(MAX),
  [documents]            NVARCHAR(MAX),              -- JSON
  [created_at]           DATETIME2 DEFAULT GETUTCDATE(),
  [updated_at]           DATETIME2 DEFAULT GETUTCDATE(),
  CONSTRAINT [grants_project_number_unique] UNIQUE ([project_number])
);
GO

-- ── session (connect-mssql-v2 table) ─────────────────────────────────────────
-- Created automatically by connect-mssql-v2 on first request.
-- Included here for completeness / explicit provisioning on locked-down farms.
IF OBJECT_ID(N'dbo.sessions', N'U') IS NULL
CREATE TABLE [dbo].[sessions] (
  [sid]    NVARCHAR(255)  NOT NULL PRIMARY KEY,
  [sess]   NVARCHAR(MAX)  NOT NULL,
  [expire] DATETIME2      NOT NULL
);
GO

PRINT '0001_initial_schema.sql applied successfully.';
GO
