-- Demo Seed Data
-- Safe to re-run: uses INSERT ... ON CONFLICT DO NOTHING throughout.
-- Run only when AUTH_MODE=demo (controlled by docker-entrypoint.sh).

-- ── Scientists ────────────────────────────────────────────────────────────────
INSERT INTO scientists (id, honorific_title, first_name, last_name, job_title, email, staff_id, department, staff_type, bio, profile_image_initials)
VALUES
  (1,  'Dr.',   'Sarah',    'Chen',       'Investigator',            's.chen@research.org',          '10001', 'Genomics',              'scientific',     'Principal Investigator specialising in cancer genomics and precision medicine.', 'SC'),
  (2,  'Dr.',   'Michael',  'Rodriguez',  'Staff Scientist',         'm.rodriguez@research.org',     '10002', 'Oncology',              'scientific',     'Staff scientist focused on translational oncology research.',                  'MR'),
  (3,  'Dr.',   'Emily',    'Hassan',     'Physician',               'e.hassan@research.org',        '10003', 'Clinical Research',     'scientific',     'Clinician-scientist bridging bench research and patient care.',                'EH'),
  (4,  'Dr.',   'James',    'Wilson',     'Staff Scientist',         'j.wilson@research.org',        '10004', 'Bioinformatics',        'scientific',     'Computational biologist developing next-generation analysis pipelines.',       'JW'),
  (5,  '',      'Lisa',     'Thompson',   'Lab Manager',             'l.thompson@research.org',      '10005', 'Genomics',              'scientific',     'Lab manager overseeing daily operations of the genomics core.',               'LT'),
  (6,  'Dr.',   'Alex',     'Kumar',      'Postdoctoral Researcher', 'a.kumar@research.org',         '10006', 'Immunology',           'scientific',     'Postdoc investigating innate immune responses to infection.',                  'AK'),
  (7,  '',      'Maria',    'Santos',     'PhD Student',             'm.santos@research.org',        '10007', 'Genomics',              'scientific',     'PhD candidate studying epigenetic regulation of gene expression.',            'MS'),
  (8,  '',      'Iris',     'Administrator', 'Management',           'iris.admin@research.org',      '10008', 'Research Office',       'administrative', 'Research operations manager overseeing all administrative functions.',        'IA'),
  (9,  'Dr.',   'Jennifer', 'Park',       'IRB Board Member',        'j.park@research.org',          '10009', 'Ethics',                'administrative', 'IRB Chair with expertise in research ethics and compliance.',                  'JP'),
  (10, 'Dr.',   'Robert',   'Kim',        'IBC Board Member',        'r.kim@research.org',           '10010', 'Biosafety',             'administrative', 'Biosafety officer and IBC Chair.',                                            'RK'),
  (11, '',      'Jessica',  'Morgan',     'Outcome Officer',         'j.morgan@research.org',        '10011', 'Publications Office',   'administrative', 'Outcome officer managing publication tracking and IP.',                       'JM'),
  (12, '',      'Sarah',    'Mitchell',   'Grant Officer',           'sarah.mitchell@research.org',  '10012', 'Grants Office',         'administrative', 'Grants officer supporting funding applications.',                             'SM'),
  (13, '',      'David',    'Thompson',   'Contracts Officer',       'd.thompson@research.org',      '10013', 'Legal & Contracts',     'administrative', 'Contracts officer managing research agreements.',                             'DT'),
  (14, 'Prof.', 'Ahmed',    'Al-Rashid',  'Investigator',            'a.alrashid@research.org',      '10014', 'Cardiology',            'scientific',     'Senior investigator and programme director for cardiovascular research.',     'AA'),
  (15, 'Dr.',   'Fatima',   'Al-Zahra',   'Staff Scientist',         'f.alzahra@research.org',       '10015', 'Metabolic Disease',     'scientific',     'Staff scientist focusing on type-2 diabetes and metabolic syndrome.',         'FA')
ON CONFLICT (id) DO NOTHING;

-- Reset sequence so future inserts don't collide
SELECT setval('scientists_id_seq', (SELECT MAX(id) FROM scientists));

-- ── Programs ──────────────────────────────────────────────────────────────────
INSERT INTO programs (id, program_id, name, description, program_director_id)
VALUES
  (1, 'PRM-001', 'Cancer Genomics Initiative',          'Comprehensive programme investigating the genomic landscape of cancers prevalent in the Gulf region.', 1),
  (2, 'PRM-002', 'Cardiovascular Research Programme',   'Multidisciplinary programme studying cardiovascular disease risk factors, biomarkers and therapeutics.', 14),
  (3, 'PRM-003', 'Infectious Disease & Immunology',     'Programme targeting infectious diseases endemic to the MENA region and host immune responses.',         6),
  (4, 'PRM-004', 'Metabolic & Endocrine Disorders',     'Research into type-2 diabetes, obesity and related metabolic conditions in the Qatari population.',     15)
ON CONFLICT (id) DO NOTHING;

SELECT setval('programs_id_seq', (SELECT MAX(id) FROM programs));

-- ── Projects ──────────────────────────────────────────────────────────────────
INSERT INTO projects (id, project_id, program_id, name, description, principal_investigator_id)
VALUES
  (1,  'PRJ-001', 1, 'Colorectal Cancer Biomarkers',         'Identifying novel biomarkers for early detection of colorectal cancer.',                 1),
  (2,  'PRJ-002', 1, 'Breast Cancer Genomics',               'Whole-genome sequencing study of breast cancer in Arab women.',                          1),
  (3,  'PRJ-003', 2, 'Heart Failure Cohort Study',           'Longitudinal cohort tracking biomarkers of heart failure progression.',                  14),
  (4,  'PRJ-004', 2, 'Hypertension Genetics',                'GWAS study identifying genetic risk loci for hypertension in the Gulf population.',      14),
  (5,  'PRJ-005', 3, 'COVID-19 Long-Term Outcomes',          'Studying persistent symptoms and immune dysregulation in Long COVID patients.',           6),
  (6,  'PRJ-006', 3, 'Antimicrobial Resistance Surveillance','Monitoring AMR patterns in clinical isolates across Sidra Medicine.',                    3),
  (7,  'PRJ-007', 4, 'Qatar Diabetes Registry',              'Establishing a national registry of type-2 diabetes patients in Qatar.',                  15),
  (8,  'PRJ-008', 4, 'Childhood Obesity Intervention',       'Randomised trial of a school-based intervention to reduce childhood obesity.',           3)
ON CONFLICT (id) DO NOTHING;

SELECT setval('projects_id_seq', (SELECT MAX(id) FROM projects));

-- ── Research Activities ───────────────────────────────────────────────────────
INSERT INTO research_activities (id, sdr_number, project_id, title, short_title, description, status, start_date, end_date, budget_holder_id, sidra_branch, budget_source)
VALUES
  (1,  'SDR-2024-001', 1, 'Whole Exome Sequencing of 500 CRC Patients',           'CRC WES Study',          'Comprehensive WES analysis identifying somatic mutations in colorectal cancer.',   'active',    '2024-01-15', '2025-12-31', 1,  'Research', ARRAY['IRF','QNRF']),
  (2,  'SDR-2024-002', 1, 'ctDNA Liquid Biopsy Validation',                        'ctDNA Validation',       'Validating circulating tumour DNA as a non-invasive CRC diagnostic.',             'active',    '2024-03-01', '2026-02-28', 1,  'Research', ARRAY['IRF']),
  (3,  'SDR-2024-003', 2, 'Germline BRCA Testing in Qatari Women',                 'BRCA Screening',         'Population-level germline BRCA1/2 screening in women with breast cancer.',        'active',    '2024-01-01', '2026-06-30', 1,  'Clinical', ARRAY['PI Budget','QNRF']),
  (4,  'SDR-2023-001', 3, 'Cardiac Biomarker Longitudinal Cohort',                 'Cardiac Biomarkers',     'Tracking NT-proBNP and troponin in 300 heart failure patients over 3 years.',    'active',    '2023-06-01', '2026-05-31', 14, 'Clinical', ARRAY['IRF']),
  (5,  'SDR-2023-002', 4, 'Hypertension GWAS in 2000 Gulf Participants',           'Hypertension GWAS',      'Genome-wide association study identifying genetic risk variants for hypertension.','active',    '2023-09-01', '2025-08-31', 14, 'Research', ARRAY['QNRF']),
  (6,  'SDR-2022-001', 5, 'Long COVID Immune Profiling',                            'Long COVID Immunity',    'Deep immune phenotyping of Long COVID patients vs recovered controls.',            'completed', '2022-01-01', '2023-12-31', 6,  'Research', ARRAY['IRF','External']),
  (7,  'SDR-2024-004', 6, 'AMR Genomic Surveillance in ICU Isolates',              'AMR Surveillance',       'Whole-genome sequencing of drug-resistant pathogens from ICU patients.',          'active',    '2024-04-01', '2025-03-31', 3,  'Clinical', ARRAY['IRF']),
  (8,  'SDR-2023-003', 7, 'Qatar National Diabetes Registry Establishment',        'Diabetes Registry',      'Setting up the national diabetes patient registry and data governance framework.','active',    '2023-01-01', '2025-12-31', 15, 'Research', ARRAY['QNRF','IRF']),
  (9,  'SDR-2024-005', 8, 'School-Based Obesity RCT',                              'Obesity RCT',            'Randomised controlled trial of a structured intervention programme in schools.',  'planning',  '2024-09-01', '2027-08-31', 3,  'Clinical', ARRAY['External']),
  (10, 'SDR-2022-002', 2, 'RNA-Seq Transcriptomics of Breast Tumours',             'Breast RNA-Seq',         'Transcriptomic profiling of breast tumour and matched normal tissue samples.',     'completed', '2022-06-01', '2024-05-31', 1,  'Research', ARRAY['IRF'])
ON CONFLICT (id) DO NOTHING;

SELECT setval('research_activities_id_seq', (SELECT MAX(id) FROM research_activities));

-- ── Publications ──────────────────────────────────────────────────────────────
INSERT INTO publications (id, research_activity_id, title, authors, journal, volume, issue, pages, doi, publication_date, publication_type, status)
VALUES
  (1,  6,  'Persistent immune dysregulation in Long COVID: a multi-omics perspective',
           'Kumar A, Hassan E, Chen S',
           'Nature Medicine', '29', '4', '812-824',
           '10.1038/s41591-023-01234-5', '2023-04-15', 'Journal Article', 'Published'),
  (2,  10, 'Transcriptomic landscape of breast cancer in Arab women: a population-specific analysis',
           'Chen S, Rodriguez M, Wilson J',
           'Cancer Research', '83', '12', '2145-2158',
           '10.1158/0008-5472.CAN-23-0567', '2023-06-20', 'Journal Article', 'Published'),
  (3,  1,  'Somatic mutation landscape of colorectal cancer in the Qatari population',
           'Chen S, Wilson J, Santos M, Rodriguez M',
           'Gut', NULL, NULL, NULL,
           NULL, NULL, 'Journal Article', 'Under Review'),
  (4,  5,  'Genome-wide association study identifies novel loci for hypertension in Gulf Arab populations',
           'Al-Rashid A, Wilson J, Rodriguez M',
           'Nature Genetics', NULL, NULL, NULL,
           NULL, NULL, 'Journal Article', 'Under Review'),
  (5,  6,  'Long COVID immune phenotyping reveals distinct patient clusters',
           'Kumar A, Hassan E',
           'Immunity', '56', '8', '1720-1735',
           '10.1016/j.immuni.2023.06.010', '2023-08-10', 'Journal Article', 'Published'),
  (6,  8,  'Establishing a national diabetes registry: lessons from Qatar',
           'Al-Zahra F, Thompson D, Hassan E',
           'Diabetes Care', '47', '2', '234-241',
           '10.2337/dc23-1789', '2024-02-01', 'Journal Article', 'Published'),
  (7,  3,  'Prevalence of BRCA1/2 pathogenic variants in Qatari women with breast cancer',
           'Chen S, Hassan E, Al-Rashid A',
           'Journal of Medical Genetics', NULL, NULL, NULL,
           NULL, NULL, 'Journal Article', 'In Preparation'),
  (8,  7,  'Genomic epidemiology of carbapenem-resistant Klebsiella pneumoniae in a quaternary care centre',
           'Hassan E, Rodriguez M',
           'The Lancet Infectious Diseases', '24', '3', '278-289',
           '10.1016/S1473-3099(23)00612-0', '2024-03-05', 'Journal Article', 'Published')
ON CONFLICT (id) DO NOTHING;

SELECT setval('publications_id_seq', (SELECT MAX(id) FROM publications));

-- ── IRB Applications ──────────────────────────────────────────────────────────
INSERT INTO irb_applications (id, research_activity_id, irb_number, title, principal_investigator_id, protocol_type, status, submission_date, initial_approval_date, expiration_date, description)
VALUES
  (1, 1,  'IRB-2024-001', 'Whole Exome Sequencing of 500 CRC Patients',                1, 'Expedited',   'Active',   '2023-11-01', '2024-01-10', '2025-01-09', 'Prospective collection of tumour and normal tissue for WES.'),
  (2, 2,  'IRB-2024-002', 'ctDNA Liquid Biopsy Validation Study',                      1, 'Expedited',   'Active',   '2024-01-15', '2024-03-01', '2025-02-28', 'Serial blood sampling for ctDNA longitudinal analysis.'),
  (3, 3,  'IRB-2024-003', 'Germline BRCA Testing Programme in Qatari Women',           1, 'Full Board',  'Active',   '2023-10-01', '2023-12-15', '2024-12-14', 'Genetic testing and counselling for hereditary breast cancer.'),
  (4, 4,  'IRB-2023-001', 'Cardiac Biomarker Longitudinal Cohort Study',               14, 'Expedited',  'Active',   '2023-03-01', '2023-06-01', '2024-05-31', 'Longitudinal collection of blood samples from heart failure patients.'),
  (5, 6,  'IRB-2022-001', 'Long COVID Immune Profiling Study',                          6, 'Full Board',  'Inactive', '2021-10-01', '2022-01-01', '2023-12-31', 'Deep immune phenotyping through multi-omic approaches.'),
  (6, 8,  'IRB-2023-002', 'Qatar National Diabetes Registry',                          15, 'Expedited',  'Active',   '2022-09-01', '2023-01-01', '2025-12-31', 'Establishment and maintenance of the national diabetes patient registry.'),
  (7, 9,  'IRB-2024-004', 'School-Based Obesity Intervention RCT',                      3, 'Full Board',  'Pending',  '2024-05-01', NULL,         NULL,         'Randomised controlled trial in schools; awaiting board review.')
ON CONFLICT (id) DO NOTHING;

SELECT setval('irb_applications_id_seq', (SELECT MAX(id) FROM irb_applications));

-- ── IBC Applications ──────────────────────────────────────────────────────────
INSERT INTO ibc_applications (id, ibc_number, title, principal_investigator_id, biosafety_level, risk_group_classification, recombinant_synthetic_nucleic_acid, status, submission_date, approval_date)
VALUES
  (1, 'IBC-2024-001', 'rDNA manipulation of colorectal cancer cell lines',         1, 'BSL-2', 'Risk Group 2', true,  'Approved', '2024-01-20', '2024-02-15'),
  (2, 'IBC-2024-002', 'Lentiviral vector transduction for BRCA gene studies',      1, 'BSL-2', 'Risk Group 2', true,  'Approved', '2024-02-01', '2024-03-10'),
  (3, 'IBC-2023-001', 'Long COVID viral culture and passage experiments',           6, 'BSL-3', 'Risk Group 3', false, 'Approved', '2021-12-01', '2022-01-15'),
  (4, 'IBC-2024-003', 'AMR isolate culture and genomic characterisation',          3, 'BSL-2', 'Risk Group 2', false, 'Approved', '2024-03-15', '2024-04-01'),
  (5, 'IBC-2024-004', 'CRISPR-Cas9 editing of primary T cells for immunotherapy',  6, 'BSL-2', 'Risk Group 2', true,  'Under Review', '2024-05-10', NULL)
ON CONFLICT (id) DO NOTHING;

SELECT setval('ibc_applications_id_seq', (SELECT MAX(id) FROM ibc_applications));

-- ── Grants ────────────────────────────────────────────────────────────────────
INSERT INTO grants (id, cycle, project_number, lpi_id, investigator_type, title, requested_amount, awarded_amount, submitted_year, awarded, awarded_year, running_time_years, current_grant_year)
VALUES
  (1, '2022-1', 'QNRF-NPRP-2022-001', 1,  'Researcher', 'Genomic determinants of colorectal cancer in the Gulf region',         4500000, 4200000, 2022, true,  2023, 3, '2/3'),
  (2, '2023-1', 'QNRF-NPRP-2023-007', 14, 'Clinician',  'Cardiovascular disease risk stratification using multi-omic biomarkers',3800000, 3500000, 2023, true,  2024, 3, '1/3'),
  (3, '2021-2', 'QNRF-NPRP-2021-014', 6,  'Researcher', 'Host immune determinants of COVID-19 severity and Long COVID',         5000000, 4800000, 2021, true,  2022, 4, '4/4'),
  (4, '2024-1', 'QNRF-NPRP-2024-003', 15, 'Clinician',  'Genomics of type-2 diabetes in the Qatari population',                4200000, NULL,    2024, false, NULL, NULL, NULL),
  (5, '2023-2', 'IRF-2023-011',        1,  'Researcher', 'Single-cell transcriptomics of the breast cancer tumour microenvironment',2100000,1900000, 2023, true,  2023, 2, '2/2')
ON CONFLICT (id) DO NOTHING;

SELECT setval('grants_id_seq', (SELECT MAX(id) FROM grants));

-- ── Research Contracts ────────────────────────────────────────────────────────
INSERT INTO research_contracts (id, contract_number, title, status, contract_type, counterparty_name, start_date, end_date, research_activity_id)
VALUES
  (1, 'RC-2024-001', 'Genomic Sequencing Services Agreement — Illumina',              'Active',   'Service Agreement',      'Illumina Inc.',                   '2024-01-01', '2024-12-31', 1),
  (2, 'RC-2024-002', 'Data Sharing Agreement — TCGA Consortium',                      'Active',   'Data Sharing Agreement', 'NCI GDC',                         '2024-02-01', '2025-01-31', 1),
  (3, 'RC-2023-001', 'Collaborative Research Agreement — HBKU',                       'Active',   'Collaboration Agreement', 'Hamad Bin Khalifa University',   '2023-09-01', '2026-08-31', 5),
  (4, 'RC-2023-002', 'Clinical Sample Transfer Agreement — Hamad Medical Corporation','Active',   'MTA',                    'Hamad Medical Corporation',       '2023-07-01', '2025-06-30', 8),
  (5, 'RC-2024-003', 'Research Services Agreement — Oxford Biosciences',              'Pending',  'Service Agreement',      'Oxford Biosciences Ltd.',         '2024-07-01', '2025-06-30', 2)
ON CONFLICT (id) DO NOTHING;

SELECT setval('research_contracts_id_seq', (SELECT MAX(id) FROM research_contracts));

-- ── Project Members (team assignments) ────────────────────────────────────────
INSERT INTO project_members (research_activity_id, scientist_id, role)
VALUES
  (1, 1,  'Principal Investigator'),
  (1, 4,  'Lead Scientist'),
  (1, 7,  'PhD Student'),
  (2, 1,  'Principal Investigator'),
  (2, 4,  'Lead Scientist'),
  (3, 1,  'Principal Investigator'),
  (3, 3,  'Co-Investigator'),
  (4, 14, 'Principal Investigator'),
  (4, 2,  'Lead Scientist'),
  (5, 14, 'Principal Investigator'),
  (5, 4,  'Bioinformatician'),
  (6, 6,  'Principal Investigator'),
  (6, 3,  'Co-Investigator'),
  (7, 3,  'Principal Investigator'),
  (7, 2,  'Lead Scientist'),
  (8, 15, 'Principal Investigator'),
  (8, 3,  'Co-Investigator'),
  (9, 3,  'Principal Investigator'),
  (10, 1, 'Principal Investigator'),
  (10, 4, 'Bioinformatician')
ON CONFLICT DO NOTHING;

-- ── Data Management Plans ─────────────────────────────────────────────────────
INSERT INTO data_management_plans (id, dmp_number, research_activity_id, title, status, data_types, storage_location, retention_period)
VALUES
  (1, 'DMP-2024-001', 1, 'DMP for CRC WES Study',             'Approved', ARRAY['Genomic sequences','Clinical data'], 'Sidra HPC / Qatar National Research Network', '10 years'),
  (2, 'DMP-2024-002', 2, 'DMP for ctDNA Liquid Biopsy Study', 'Approved', ARRAY['ctDNA sequencing data','Patient metadata'], 'Sidra HPC', '10 years'),
  (3, 'DMP-2023-001', 4, 'DMP for Cardiac Biomarker Cohort',  'Approved', ARRAY['Clinical biomarker data','EHR data'], 'Sidra Secure Research Environment', '15 years'),
  (4, 'DMP-2024-003', 8, 'DMP for Qatar Diabetes Registry',   'Draft',    ARRAY['Registry data','Genomic data','Clinical outcomes'], 'Qatar National Research Network', '20 years')
ON CONFLICT (id) DO NOTHING;

SELECT setval('data_management_plans_id_seq', (SELECT MAX(id) FROM data_management_plans));

-- ── Users (demo login record so the session links correctly) ──────────────────
-- Insert a demo admin user so admin features are accessible
INSERT INTO users (id, username, name, email, password, role)
VALUES (1, 'demo.user', 'Demo User', 'demo@researchvault.local', '', 'admin')
ON CONFLICT (id) DO NOTHING;

SELECT setval('users_id_seq', GREATEST((SELECT MAX(id) FROM users), 1));
