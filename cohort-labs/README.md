# AWS SAA Cohort 5 — Hands-On Labs

Instructor-only resource folder. Contains lab guides, IAM policies, and automation scripts for 5 hands-on AWS labs targeting the Solutions Architect Associate exam.

**Target cohort:** ~100 students | **Region:** eu-central-1 | **Start:** August 2026

---

## Folder Structure

```
cohort-labs/
├── students.txt                      # One IAM username per line
├── scripts/
│   ├── unlock_students.py            # Grant access: add students to IAM group
│   ├── lock_students.py              # Revoke access: remove from IAM group
│   └── inventory_resources.py        # List all resources in region (CloudShell)
├── lab-01-s3-cloudfront/
├── lab-02-serverless-trio/
├── lab-03-event-driven-rekognition/
├── lab-04-sqs-lambda/
└── lab-05-ec2-ssm/
```

Each lab folder contains:
- `guide.html` — Open in browser → File → Print → Save as PDF to distribute
- `iam-policy.json` — Attach to the lab's IAM Group

---

## IAM Group Naming Convention

| Group Name                    | Lab |
|-------------------------------|-----|
| `SAA-Base-Group`              | Always assigned — password change only |
| `SAA-Lesson-01-S3-CF`        | Lab 1 |
| `SAA-Lesson-02-Serverless`   | Lab 2 |
| `SAA-Lesson-03-Rekognition`  | Lab 3 |
| `SAA-Lesson-04-SQS`          | Lab 4 |
| `SAA-Lesson-05-EC2-SSM`      | Lab 5 |

---

## Workflow Per Session

Upload all scripts + `students.txt` to CloudShell via **Actions → Upload file**, then run from `~/` directly (no `scripts/` prefix in CloudShell):

```bash
# Before class — switch students to today's lesson group
python unlock_students.py --group SAA-Lesson-02-Serverless

# After class — remove from lesson group, restore base group
python lock_students.py

# At end of weekend — audit and interactively delete resources
python inventory_resources.py --region eu-central-1
```

---

## Cost Guardrails
- All student actions locked to `eu-central-1`
- AWS Budget alert at $15/month (50%, 80%, 100%)
- DynamoDB: On-Demand mode only
- EC2: t3.micro only (enforced via IAM condition)
- Run `aws-nuke` or `cloud-nuke` after each weekend targeting `eu-central-1`
