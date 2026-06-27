# Lab 03 — Event-Driven Image Analysis & Pub/Sub

**Services:** S3 · Lambda · Amazon Rekognition · Amazon SNS | **Region:** eu-central-1 | **Time:** 60 min

## Goal

Build an event-driven pipeline that automatically analyzes images the moment they are uploaded to S3. When a `.png` file lands in your bucket, S3 triggers a Lambda function which calls Rekognition to detect objects and scenes, then publishes a personalized report to SNS — which sends you an email.

## Architecture

```
Student uploads .png → S3 → s3:ObjectCreated event → Lambda → Rekognition (DetectLabels) → SNS → Email
```

## Prerequisites

- AWS Console open, region set to **EU (Frankfurt) eu-central-1**
- Instructor pre-created `SAA-Lab-Lambda-Rekognition-Role` (Lambda + Rekognition DetectLabels + SNS Publish + S3 GetObject + CloudWatch Logs)
- A `.png` image ready to upload
- Access to a **personal** email inbox during the lab (see subscription note below)

## Naming Convention

Replace `firstname-lastname` with your name, lowercase and hyphen-separated (e.g. `john-doe`). The lab policy enforces this — resources named differently will be denied.

| Resource | Name |
|---|---|
| SNS topic | `firstname-lastname-lab3` |
| Lambda function | `firstname-lastname-lab3` |
| S3 bucket prefix | `firstname-lastname-lab3` (AWS appends account suffix automatically) |
| Event notification | `get-image-to-rekognition` |

---

## Steps

### Part A — Create an SNS Topic and Subscribe Your Email

**1.** Open **Amazon SNS** → **Topics** → **Create topic**.  
Type: **Standard** | Name: `firstname-lastname-lab3` | Leave all defaults → **Create topic**.  
**Copy the Topic ARN** shown on the details page — you will need it in step 6.

![SNS Create Topic — Standard type and name](guide-screenshots/Screenshot%202026-06-27%20203011.png)

**2.** In the left navigation click **Subscriptions** → **Create subscription**.  
Topic ARN: select your topic | Protocol: **Email** | Endpoint: your email address → **Create subscription**.

![SNS Create Subscription — topic ARN, Email protocol, endpoint](guide-screenshots/Screenshot%202026-06-27%20203242.png)

**3.** Check your inbox for the AWS confirmation email and click **Confirm subscription**. Status must show **Confirmed** before continuing.

> **⚠️ Subscription deactivated immediately?** Some email security scanners (Google Workspace, corporate mail filters) automatically follow all links — including the unsubscribe link — before you can act. If this happens: go to **SNS → Subscriptions** → select the deleted entry → **Request confirmation**, then open the new email on your phone and confirm from there. Using a personal Gmail or Outlook account avoids this issue.

---

### Part B — Create the Lambda Function

**4.** Open **Lambda** in a new tab → **Create function** → **Author from scratch**.  
Function name: `firstname-lastname-lab3` | Runtime: **Python 3.14**  
Scroll down and expand **Additional settings** → under **Execution role** select **Use an existing role** → choose `SAA-Lab-Lambda-Rekognition-Role`.  
Leave all other defaults → **Create function**.

![Lambda Create Function — function name and Python 3.14 runtime](guide-screenshots/Screenshot%202026-06-27%20203524.png)

**5.** In the **Code** tab, replace the default code with the following. **Do not click Deploy yet.**

```python
import boto3
import os
import urllib.parse
from botocore.exceptions import ClientError

rekognition = boto3.client("rekognition", region_name="eu-central-1")
sns = boto3.client("sns", region_name="eu-central-1")

def lambda_handler(event, context):
    record = event["Records"][0]["s3"]
    bucket = record["bucket"]["name"]
    key = urllib.parse.unquote_plus(record["object"]["key"])

    student_name = os.environ.get("STUDENT_NAME", "Student")
    sns_topic_arn = os.environ["SNS_TOPIC_ARN"]

    try:
        response = rekognition.detect_labels(
            Image={"S3Object": {"Bucket": bucket, "Name": key}},
            MaxLabels=10,
            MinConfidence=75,
        )
    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        if error_code == "InvalidImageFormatException":
            sns.publish(
                TopicArn=sns_topic_arn,
                Subject="[Lab 03] Upload Failed — Invalid Image Format",
                Message=(
                    f"Hi {student_name},\n\n"
                    f"Your uploaded file '{key}' could not be analyzed.\n\n"
                    f"Rekognition only supports JPEG and PNG files. "
                    f"Files renamed from HEIC, WebP, or BMP will not work.\n\n"
                    f"Please convert your image to JPEG or PNG and upload again."
                ),
            )
        raise

    labels = [l["Name"] for l in response["Labels"]]
    numbered = "\n".join(f"{i + 1}. {label}" for i, label in enumerate(labels))

    message = (
        f"Hi {student_name},\n\n"
        f"Rekognition has classified the following things in your uploaded image:\n\n"
        f"{numbered}"
    )

    sns.publish(
        TopicArn=sns_topic_arn,
        Subject="[Lab 03] Image Analysis Complete",
        Message=message,
    )
    return {"statusCode": 200, "labels": labels}
```

> **⚠️ Image format:** Rekognition only accepts genuine JPEG and PNG files. Files that merely have a `.png` extension but are actually HEIC (iPhone photos), WebP, or BMP will fail. Use a screenshot (Windows Snipping Tool / macOS Cmd+Shift+4) or export from a photo editor as PNG/JPEG. The code above sends you a helpful email instead of silently failing if the format is wrong.

**6.** Click the **Configuration** tab → **Environment variables** → **Edit** → **Add environment variable**:
- `SNS_TOPIC_ARN` = the Topic ARN you copied in step 1
- `STUDENT_NAME` = your first name (e.g. `Alice`)

Click **Save**.

![Lambda — Edit environment variables](guide-screenshots/Screenshot%202026-06-27%20203907.png)

![Lambda — Configuration tab showing saved environment variables](guide-screenshots/Screenshot%202026-06-27%20203944.png)

**7.** Click the **Code** tab → click **Deploy**. Wait for the success banner.

---

### Part C — Create the S3 Bucket and Wire the Event

**8.** Open **S3** in a new tab → **Create bucket**.  
Leave **Bucket namespace** on **Account Regional namespace (recommended)**.  
**Bucket name prefix:** `firstname-lastname-lab3` — AWS automatically appends your account ID and region as a suffix.  
Leave all other defaults → **Create bucket**.

![S3 Create Bucket — Account Regional namespace and name prefix](guide-screenshots/Screenshot%202026-06-27%20204115.png)

**9.** Open the bucket → **Properties** tab → scroll to **Event notifications** → **Create event notification**.  
Event name: `get-image-to-rekognition`  
Leave **Prefix** empty. Under **Suffix** enter `.png` (only PNG uploads will trigger the pipeline).  
Event types: check **All object create events**.

![S3 Event Notification — name, .png suffix, all object create events](guide-screenshots/Screenshot%202026-06-27%20204757.png)

Scroll to **Destination**: select **Lambda function** → **Choose from your Lambda functions** → select `firstname-lastname-lab3` → **Save changes**.

![S3 Event Notification — Lambda function destination](guide-screenshots/Screenshot%202026-06-27%20204908.png)

---

### Part D — Test the Pipeline

**10.** Before uploading, convert your image to a genuine PNG or JPG using **[cloudconvert.com](https://cloudconvert.com/)** — upload your photo, select PNG or JPG as output, convert, and download. Phone photos (HEIC) and WebP files will cause Rekognition to fail even if renamed to `.png`.

> **⚠️ Also verify** that the `SNS_TOPIC_ARN` env variable contains the **full ARN** (e.g. `arn:aws:sns:eu-central-1:123456789012:john-doe-lab3`), not just the topic name.

**11.** In your S3 bucket → **Objects** tab → **Upload** → **Add files** → select the converted `.png` or `.jpg` file → **Upload**.

**12.** Wait 10–30 seconds, then check your inbox. You should receive an email that opens with *"Hi [your name],"* followed by a numbered list of detected objects.

**13.** In Lambda → **Monitor** tab → **View CloudWatch logs** to confirm `statusCode: 200` in the execution log.

---

## Verification

- Email arrives within 30 seconds, opens with `Hi [your name],` and lists detected objects ✅
- CloudWatch log group `/aws/lambda/firstname-lastname-lab3` shows `statusCode: 200` ✅
- Uploading a file that wasn't converted via cloudconvert triggers a helpful error email explaining the issue ✅

---

## Cleanup

1. S3 → your bucket (`firstname-lastname-lab3-<account-suffix>`) → select all objects → **Delete**
2. Lambda → `firstname-lastname-lab3` → **Actions** → **Delete**
3. SNS → **Subscriptions** → select your subscription → **Delete**
4. SNS → **Topics** → `firstname-lastname-lab3` → **Delete**

---

## Key Exam Concepts

| Concept | What to Know |
|---|---|
| **Event-driven decoupling** | S3, Lambda, and SNS are independent — replacing any one doesn't require changing the others |
| **S3 Event Notifications** | Can target Lambda, SQS, or SNS; suffix/prefix filters prevent processing unintended objects |
| **Amazon Rekognition** | Fully managed ML vision service — no model training needed |
| **SNS Fan-out** | A single SNS Publish can trigger multiple subscribers simultaneously |
| **Lambda environment variables** | Use env vars for ARNs and config — never hardcode sensitive values in code |
| **Asynchronous invocation** | S3-triggered Lambda is async — retries on failure; events can go to a Dead Letter Queue |
