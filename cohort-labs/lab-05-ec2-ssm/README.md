# Lab 05 — Secure Compute Infrastructure

**Services:** Amazon EC2 · AWS Systems Manager (Session Manager) · IAM Instance Profile | **Region:** eu-central-1 | **Time:** 45 min

## Goal

Launch a secure EC2 instance with **zero open inbound ports** — no SSH (port 22), no HTTP (port 80) exposed to the internet. You will access the instance through AWS Systems Manager Session Manager, which routes traffic through AWS's secure control plane. Apache is installed automatically via User Data.

> **Security highlight:** The Security Group has 0 inbound rules. This is intentional and the correct pattern for managed fleets.

## Architecture

```
You (Browser) → SSM Session Manager → EC2 t3.micro (Amazon Linux 2023, Apache running)
                                              ↕
                                    IAM Instance Profile: SAA-Lab-EC2-SSM-Role
                                    Security Group: 0 inbound rules, all outbound allowed
```

## Prerequisites

- AWS Console open, region set to **EU (Frankfurt) eu-central-1**
- Instructor pre-created `SAA-Lab-EC2-SSM-Role` with `AmazonSSMManagedInstanceCore` attached
- **No key pair needed** — this is the point of the lab

---

## Steps

### Part A — Create a Security Group with Zero Inbound Rules

**1.** Open **EC2** → **Security Groups** (left sidebar) → **Create security group**.

**2.** Name: `lab05-ssm-only`. Description: `Zero inbound rules - SSM access only`. VPC: select the **Default VPC**.

**3.** Under **Inbound rules**: do **not** add any rules. Under **Outbound rules**: leave the default "All traffic" rule. Click **Create security group**.

---

### Part B — Launch the EC2 Instance

**4.** Open **EC2** → **Instances** → **Launch instances**.

**5.** Name: `lab05-web-server`. AMI: **Amazon Linux 2023 AMI** (first option). Instance type: **t3.micro**.

**6.** Key pair: **Proceed without a key pair**.

**7.** Network settings → click **Edit**. Security group: **Select existing security group** → choose `lab05-ssm-only`.

**8.** Expand **Advanced details**. IAM instance profile: select `SAA-Lab-EC2-SSM-Role`.

**9.** Scroll to **User data**. Paste the following script and click **Launch instance**:

```bash
#!/bin/bash
dnf update -y
dnf install -y httpd
systemctl start httpd
systemctl enable httpd
echo "<h1>Hello from Lab 05! Instance: $(hostname -f)</h1>" > /var/www/html/index.html
```

---

### Part C — Connect via Session Manager

**10.** Wait ~2 minutes. In EC2 → Instances, confirm the instance shows **Running** and **2/2 checks passed**.

**11.** Select your instance → click **Connect** → choose the **Session Manager** tab → click **Connect**.

**12.** A browser-based terminal opens. Run:

```bash
curl http://localhost
```

Expected output: `<h1>Hello from Lab 05! Instance: ip-x-x-x-x.eu-central-1.compute.internal</h1>`

**13.** Verify Apache is running:

```bash
systemctl status httpd
```

---

## Verification

- Session Manager tab shows a live terminal — without any key pair or open ports ✅
- `curl http://localhost` returns the Apache HTML page ✅
- EC2 Security Group → Inbound rules tab shows **No inbound rules** ✅

---

## Cleanup

1. EC2 → your instance → **Instance state** → **Terminate instance**
2. EC2 → Security Groups → `lab05-ssm-only` → **Delete security group**

---

## Key Exam Concepts

| Concept | What to Know |
|---------|-------------|
| **IAM Instance Profile** | A container that attaches an IAM Role to an EC2 instance — the instance receives temporary credentials via IMDS |
| **AmazonSSMManagedInstanceCore** | The AWS managed policy that grants SSM Agent on the instance permission to communicate with the SSM service |
| **Session Manager vs SSH** | Session Manager requires no open port, no key pair, is fully audited via CloudTrail, and can be restricted per user via IAM |
| **User Data** | A bootstrap script that runs once at instance launch as root — used for software installation and service startup |
| **Security Group — stateful** | If outbound is allowed, response traffic is automatically allowed back in — this is why SSM works with 0 inbound rules |
