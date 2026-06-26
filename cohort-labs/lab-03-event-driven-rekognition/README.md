# Lab 03 — Event-Driven Image Analysis & Pub/Sub

**Services:** S3 · Lambda · Amazon Rekognition · Amazon SNS | **Region:** eu-central-1 | **Time:** 60 min

## Goal

Build an event-driven pipeline that automatically analyzes images the moment they are uploaded to S3. S3 triggers a Lambda function which calls Rekognition to detect objects and scenes, then publishes the results to SNS — which sends you an email. This pattern is the foundation of async, decoupled, event-driven architectures.

## Architecture

```
Student uploads image → S3 → s3:ObjectCreated event → Lambda → Rekognition (DetectLabels) → SNS → Email
```

## Prerequisites

- AWS Console open, region set to **EU (Frankfurt) eu-central-1**
- Instructor pre-created `SAA-Lab-Lambda-Rekognition-Role` (Lambda + Rekognition + SNS Publish + S3 GetObject)
- A JPEG or PNG image ready to upload
- Access to your email inbox during the lab

---

## Steps

### Part A — Create an SNS Topic and Subscribe Your Email

**1.** Open **Amazon SNS** → **Topics** → **Create topic**. Type: **Standard**. Name: `lab03-image-alerts`. Click **Create topic**.

**2.** On the topic page click **Create subscription**. Protocol: **Email**. Endpoint: your email address. Click **Create subscription**.

**3.** Check your inbox for a confirmation email from AWS and click **Confirm subscription**. The subscription status must show **Confirmed** before continuing.

**4.** Copy the **Topic ARN** — you will paste it into the Lambda code.

---

### Part B — Create the Lambda Function

**5.** Open **Lambda** → **Create function** → Author from scratch.  
Name: `lab03-image-analyzer` | Runtime: **Python 3.12** | Existing role: `SAA-Lab-Lambda-Rekognition-Role`. Click **Create function**.

**6.** Replace the code with the following. Replace `YOUR_SNS_TOPIC_ARN` with the ARN you copied. Click **Deploy**.

```python
import boto3, json

SNS_TOPIC_ARN = "YOUR_SNS_TOPIC_ARN"
rekognition = boto3.client("rekognition", region_name="eu-central-1")
sns = boto3.client("sns", region_name="eu-central-1")

def lambda_handler(event, context):
    record = event["Records"][0]["s3"]
    bucket = record["bucket"]["name"]
    key = record["object"]["key"]

    response = rekognition.detect_labels(
        Image={"S3Object": {"Bucket": bucket, "Name": key}},
        MaxLabels=10,
        MinConfidence=75,
    )

    labels = [f"{l['Name']} ({l['Confidence']:.1f}%)" for l in response["Labels"]]
    message = f"Image: s3://{bucket}/{key}\n\nDetected labels:\n" + "\n".join(f"  - {l}" for l in labels)

    sns.publish(
        TopicArn=SNS_TOPIC_ARN,
        Subject="[Lab 03] Image Analysis Complete",
        Message=message,
    )
    return {"statusCode": 200, "labels": labels}
```

---

### Part C — Create the S3 Bucket and Wire the Event

**7.** Open **S3** → **Create bucket**. Name: `lab03-images-yourname`. Region: eu-central-1. Leave all defaults. Click **Create bucket**.

**8.** Open the bucket → **Properties** tab → scroll to **Event notifications** → **Create event notification**.

**9.** Name: `trigger-lambda-on-upload`. Event types: check **All object create events**. Destination: **Lambda function** → select `lab03-image-analyzer`. Click **Save changes**.

---

### Part D — Test the Pipeline

**10.** Open the bucket → **Upload** → **Add files** → upload any JPEG image → click **Upload**.

**11.** Wait 10–30 seconds, then check your inbox. You should receive an email listing the detected objects.

**12.** In Lambda → `lab03-image-analyzer` → **Monitor** tab → **View CloudWatch logs** to see the full execution log.

---

## Verification

- Email arrives within 30 seconds of upload containing a list of detected labels ✅
- CloudWatch log group `/aws/lambda/lab03-image-analyzer` shows a successful invocation with `statusCode: 200` ✅

---

## Cleanup

1. S3 → your bucket → delete all objects → delete the bucket
2. Lambda → `lab03-image-analyzer` → **Delete**
3. SNS → `lab03-image-alerts` → delete subscriptions → delete topic

---

## Key Exam Concepts

| Concept | What to Know |
|---------|-------------|
| **Event-driven decoupling** | S3, Lambda, and SNS are independent — replacing any one doesn't require changing the others |
| **S3 Event Notifications** | Can target Lambda, SQS, or SNS — know which trigger goes to which service |
| **Amazon Rekognition** | Fully managed ML vision service — no model training needed |
| **SNS Fan-out** | A single SNS Publish can trigger multiple subscribers simultaneously |
| **Asynchronous invocation** | S3-triggered Lambda is async — Lambda retries on failure; events can go to a Dead Letter Queue |
