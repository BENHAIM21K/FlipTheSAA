# Lab 04 — Decoupled Architecture & Queue Processing

**Services:** Amazon SQS · AWS Lambda · Amazon CloudWatch | **Region:** eu-central-1 | **Time:** 45 min

## Goal

Learn why decoupling is critical in distributed systems by connecting a message queue (SQS) to a serverless compute engine (Lambda) via an Event Source Mapping. You will manually send messages to the queue and watch Lambda automatically pick them up and process them — with full observability via CloudWatch Logs.

## Architecture

```
You (SQS Console) → SendMessage → SQS Standard Queue (lab04-orders)
                                         ↓ Event Source Mapping (poll, batch size: 5)
                                    Lambda Function → CloudWatch Logs
```

## Prerequisites

- AWS Console open, region set to **EU (Frankfurt) eu-central-1**
- Instructor pre-created `SAA-Lab-Lambda-SQS-Role` (Lambda + SQS ReceiveMessage/DeleteMessage + CloudWatch Logs)

---

## Steps

### Part A — Create the SQS Queue

**1.** Open **Amazon SQS** → **Create queue**. Type: **Standard**. Name: `lab04-orders`.

**2.** Leave all settings as default. Note the **Visibility timeout** (30 seconds) — this is how long a message is hidden from other consumers after being picked up. Click **Create queue**.

---

### Part B — Create the Lambda Function

**3.** Open **Lambda** → **Create function**. Name: `lab04-order-processor`. Runtime: **Python 3.12**. Existing role: `SAA-Lab-Lambda-SQS-Role`. Click **Create function**.

**4.** Replace the code with the following and click **Deploy**:

```python
import json

def lambda_handler(event, context):
    for record in event["Records"]:
        body = record["body"]
        print(f"Processing order: {body}")
        # In a real system you would process the order here
    print(f"Batch complete — processed {len(event['Records'])} message(s)")
    return {"statusCode": 200}
```

---

### Part C — Wire SQS to Lambda via Event Source Mapping

**5.** Still in Lambda → your function → **Configuration** tab → **Triggers** → **Add trigger**.

**6.** Source: **SQS**. SQS queue: select `lab04-orders`. **Batch size:** 5. Leave **Activate trigger** checked. Click **Add**.

---

### Part D — Send Test Messages and Observe

**7.** Open **SQS** → `lab04-orders` → **Send and receive messages** → **Send message**. Message body:

```json
{"orderId": "1001", "item": "AWS T-Shirt", "qty": 2}
```

Click **Send message**. Repeat with 2–3 more messages.

**8.** Open **Lambda** → `lab04-order-processor` → **Monitor** → **View CloudWatch logs**. Click the latest log stream.

**9.** Confirm you see log lines like:
```
Processing order: {"orderId": "1001" ...}
Batch complete — processed X message(s)
```

**10.** Back in the SQS console, check the **Messages available** counter — it should be **0** (Lambda automatically deleted messages after successful processing).

---

## Verification

- CloudWatch log stream shows each message body being printed ✅
- SQS **Messages available** drops to 0 after Lambda processes the batch ✅
- Lambda **Monitor** tab shows invocations with 0 errors ✅

---

## Cleanup

1. Lambda → `lab04-order-processor` → **Configuration** → **Triggers** → remove the SQS trigger
2. Lambda → delete function
3. SQS → `lab04-orders` → **Delete**

---

## Key Exam Concepts

| Concept | What to Know |
|---------|-------------|
| **Decoupling** | Producer and consumer are completely independent — one can go offline without affecting the other |
| **Visibility timeout** | After Lambda receives a message it becomes invisible; if Lambda fails, the message reappears and is retried |
| **Event Source Mapping** | Lambda polls SQS on your behalf — you don't manage polling infrastructure |
| **Standard vs FIFO queues** | Standard = at-least-once + best-effort ordering; FIFO = exactly-once + strict ordering (lower throughput) |
| **Dead Letter Queue (DLQ)** | Messages that fail after N retries go to the DLQ for inspection — always configure one in production |
