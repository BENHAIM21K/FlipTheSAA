// FlipTheSAA — Constants: storage keys, exam rules, section topics

// ============================================================================
// CONSTANTS - Configuration values for the quiz
// ============================================================================

export const STATE_KEY = "saa_practice_state_v1"; // localStorage key for current session
export const HISTORY_KEY = "saa_practice_history_v1"; // localStorage key for quiz history
export const TAB_KEY = "saa_active_tab_v1"; // localStorage key for last active tab
export const MAX_HISTORY_SESSIONS = 50; // Keep most recent 50 sessions (FIFO)

export const EXAM_DURATION_SEC = 130 * 60; // 130 minutes = 7800 seconds (AWS exam time)
export const EXAM_TOTAL_QUESTIONS = 65; // Standard AWS SAA exam question count
export const EXAM_SCORED_QUESTIONS = 50; // Only 50 of 65 questions count (like real exam)
export const REVIEW_MAX_QUESTIONS = 50; // Maximum questions in review mode

export const POINTS_PER_SCORED_QUESTION = 20; // 50 questions × 20 points = 1000 max
export const PASSING_SCORE = 720; // 720/1000 = 72% passing threshold

// Official SAA-C03 domain weights (share of the scored exam)
export const DOMAIN_WEIGHTS = { D1: 30, D2: 26, D3: 24, D4: 20 };

// ============================================================================
// SECTION TOPICS - Maps the ~150 raw `section` names in questions.json to
// ~60 practice topics, grouped by service family
// ============================================================================
// WHY: The bank writes the same topic many ways ("DR", "Disaster Recovery",
// "DR (Select TWO)", "DR Automation"). The Section filter lists topics, so every
// question can be reached. The 16 topic names the old filter used (EC2, S3,
// IAM, ...) are kept exactly, so sessions saved with them still match.
// A raw name not listed here becomes its own topic under "Other".
//
// Format: family → { topic: [raw section names, without "(Select TWO)"] }
export const SECTION_FAMILIES = {
  "Compute": {
    "EC2": ["EC2", "EC2 Networking"],
    "EC2 pricing": ["EC2 Pricing", "EC2 Pricing and Cost Optimization", "Spot / Mixed Instances", "Savings Plans"],
    "Auto Scaling": ["Auto Scaling", "ASG", "Auto Scaling Costs", "ELB/ASG"],
    "Lambda": ["Lambda", "Serverless"],
    "ECS": ["ECS", "ECS/ALB"],
    "EKS": ["EKS"],
    "Elastic Beanstalk": ["Elastic Beanstalk"],
    "AWS Batch": ["Batch"],
    "Outposts": ["Outposts"],
    "Compute (general)": ["Compute", "Compute Strategy"]
  },
  "Storage": {
    "S3": ["S3", "S3 / Organizations", "S3 Lifecycle", "S3 Performance", "S3 Select", "S3 Transfer", "S3/Glacier"],
    "S3 replication": ["S3 Replication"],
    "S3 costs": ["S3 Costs"],
    "EBS": ["EBS", "EBS Optimization", "EBS/EFS"],
    "EFS": ["EFS", "EFS Backup"],
    "FSx": ["FSx", "HPC Storage"],
    "Storage Gateway": ["Storage Gateway"],
    "AWS Backup": ["AWS Backup", "Backup"],
    "Storage (general)": ["Storage"]
  },
  "Databases": {
    "RDS": ["RDS", "RDS DR"],
    "Aurora": ["Aurora", "RDS/Aurora"],
    "DynamoDB": ["DynamoDB", "DynamoDB / DAX", "DynamoDB/DAX", "DynamoDB Recovery"],
    "ElastiCache": ["ElastiCache", "Caching"],
    "DocumentDB": ["DocumentDB"],
    "Neptune": ["Neptune"],
    "Databases (general)": ["Databases"]
  },
  "Networking and content delivery": {
    "VPC": ["VPC", "Networking"],
    "VPC endpoints": ["VPC Endpoints", "PrivateLink"],
    "NAT gateway": ["NAT/VPC", "NAT Cost Optimization"],
    "Transit Gateway": ["Transit Gateway"],
    "ELB": ["ELB", "ALB", "ALB/NLB", "Load Balancing"],
    "Route 53": ["Route 53", "DR/Route 53"],
    "CloudFront": ["CloudFront", "CloudFront and S3 Performance", "CloudFront Pricing", "CloudFront Security", "CloudFront/ALB"],
    "Global Accelerator": ["Global Accelerator", "Global Networking"],
    "Data transfer": ["Data Transfer"]
  },
  "Security, identity and compliance": {
    "IAM": ["IAM", "IAM Best Practices", "IAM and S3 Security", "STS", "Access"],
    "IAM Identity Center": ["IAM Identity Center"],
    "Cognito": ["Cognito"],
    "Organizations": ["Organizations", "Governance"],
    "KMS": ["KMS"],
    "Secrets Manager": ["Secrets Manager", "Secrets Manager / RDS Proxy"],
    "Certificate Manager (ACM)": ["ACM", "ACM / TLS", "Certificate Management"],
    "Security groups and NACLs": ["Security Groups", "NACL"],
    "WAF and Shield": ["WAF", "WAF / Shield", "Shield/WAF", "Firewall Manager"],
    "Network Firewall": ["Network Firewall", "Egress Filtering"],
    "GuardDuty": ["GuardDuty"],
    "Security Hub": ["Security Hub"]
  },
  "Application integration": {
    "SQS": ["SQS", "SQS FIFO", "SQS/Lambda", "SQS/SNS", "SNS/SQS"],
    "SNS": ["SNS"],
    "EventBridge": ["EventBridge"],
    "Step Functions": ["Step Functions"],
    "Messaging (general)": ["Messaging"]
  },
  "Analytics": {
    "Kinesis": ["Kinesis"],
    "Athena": ["Athena", "Athena/Glue"],
    "Glue": ["Glue"],
    "Redshift": ["Redshift"],
    "OpenSearch": ["Search Analytics"],
    "Analytics (general)": ["Analytics"]
  },
  "Management and monitoring": {
    "CloudWatch": ["CloudWatch", "Monitoring", "Logs", "Logging", "Logging Costs", "Centralized Logging"],
    "CloudTrail": ["CloudTrail"],
    "Config": ["Config"],
    "Systems Manager": ["Systems Manager"],
    "CloudFormation": ["CloudFormation", "Deployments"]
  },
  "Resilience and migration": {
    "Disaster recovery": ["Disaster Recovery", "DR", "DR Automation"],
    "Multi-AZ": ["Multi-AZ"],
    "Multi-Region": ["Multi-Region", "Multi-Region Performance"],
    "Architecture (general)": ["Architecture"],
    "Migration (DMS, MGN)": ["DMS", "MGN", "Migration"],
    "DataSync": ["DataSync"],
    "Snow Family": ["Snow Family"]
  },
  "Cost management": {
    "Cost management": ["Cost Management", "Billing"]
  },
  "Machine learning and other": {
    "Rekognition": ["Rekognition"],
    "Polly": ["Polly"],
    "Pinpoint": ["Pinpoint"]
  }
};

// raw section name (lower-case, no "(Select TWO)") → { topic, family }
const SECTION_LOOKUP = new Map();
for (const [family, topics] of Object.entries(SECTION_FAMILIES)) {
  for (const [topic, aliases] of Object.entries(topics)) {
    for (const raw of aliases) SECTION_LOOKUP.set(raw.toLowerCase(), { topic, family });
  }
}

// Cheat-sheet services whose name isn't itself a topic or an alias above.
// A service missing here and above has no tagged questions, so it gets no practice button.
const CHEATSHEET_TOPICS = {
  "S3 Glacier": "S3",
  "Aurora Serverless": "Aurora",
  "Shield": "WAF and Shield",
  "Certificate Manager": "Certificate Manager (ACM)",
  "Application Migration Service": "Migration (DMS, MGN)",
  "OpenSearch Service": "OpenSearch",
  "Fargate": "ECS",
  "Data Firehose": "Kinesis",
  "Budgets": "Cost management",
  "Cost Explorer": "Cost management",
  "Cost & Usage Report": "Cost management"
};

/**
 * WHAT IT DOES: Returns the practice topic for a cheat-sheet service, or null
 *
 * ORDER: the entry's own practiceTopic field → a topic of the same name →
 * a raw-section alias (e.g. "PrivateLink" → "VPC endpoints") → CHEATSHEET_TOPICS
 */
export function serviceTopic(entry) {
  if (entry.practiceTopic) return entry.practiceTopic;
  const name = entry.service;
  for (const topics of Object.values(SECTION_FAMILIES)) if (topics[name]) return name;
  const alias = SECTION_LOOKUP.get(String(name).toLowerCase());
  if (alias) return alias.topic;
  return CHEATSHEET_TOPICS[name] || null;
}

/**
 * WHAT IT DOES: Returns the practice topic and family for a question's raw section
 *
 * EXAMPLE:
 * sectionTopic("DR (Select TWO)") → { topic: "Disaster recovery", family: "Resilience and migration" }
 */
export function sectionTopic(rawSection) {
  const clean = String(rawSection || "").replace(/\s*\(select\s+\w+\)\s*$/i, "").trim();
  return SECTION_LOOKUP.get(clean.toLowerCase()) || { topic: clean || "Other", family: "Other" };
}
