# Lab 02 — The Serverless Web Application Trio

**Services:** API Gateway (HTTP) · AWS Lambda (Python) · Amazon DynamoDB | **Region:** eu-central-1 | **Time:** 60 min

## Goal

Build a fully serverless CRUD backend with zero servers to manage. You will create an HTTP API endpoint, wire it to a Lambda function, and persist data in DynamoDB — all without provisioning or paying for idle compute. This trio powers most modern AWS-native applications and is a core SAA exam pattern.

## Architecture

```
HTTP Client → API Gateway (HTTP API) → Lambda (Python 3.12) → DynamoDB (On-Demand)
```

## Prerequisites

- AWS Console open, region set to **EU (Frankfurt) eu-central-1**
- Your instructor has pre-created `SAA-Lab-Lambda-Basic-Role` (CloudWatch Logs + DynamoDB access)

---

## Steps

### Part A — Create the DynamoDB Table

**1.** Open **DynamoDB** → **Create table**.

**2.** **Table name:** `lab02-items` | **Partition key:** `itemId` (String).

**3.** Under **Table settings** → **Customize settings** → **Capacity mode**: choose **On-demand**. Click **Create table**.

---

### Part B — Create the Lambda Function

**4.** Open **Lambda** → **Create function** → **Author from scratch**.

**5.** **Function name:** `lab02-crud-handler` | **Runtime:** Python 3.12.

**6.** Under **Permissions** → **Change default execution role** → **Use an existing role** → select `SAA-Lab-Lambda-Basic-Role`. Click **Create function**.

**7.** In the code editor, replace the default code with the following and click **Deploy**:

```python
import json, boto3, uuid

ddb = boto3.resource("dynamodb")
table = ddb.Table("lab02-items")

def lambda_handler(event, context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
    if method == "POST":
        body = json.loads(event.get("body", "{}"))
        item_id = str(uuid.uuid4())
        table.put_item(Item={"itemId": item_id, **body})
        return {"statusCode": 201, "body": json.dumps({"itemId": item_id})}
    elif method == "GET":
        result = table.scan()
        return {"statusCode": 200, "body": json.dumps(result["Items"])}
    return {"statusCode": 405, "body": "Method Not Allowed"}
```

---

### Part C — Create the HTTP API Gateway

**8.** Open **API Gateway** → **Create API** → choose **HTTP API** → **Build**.

**9.** Click **Add integration** → select **Lambda** → choose `lab02-crud-handler`.

**10.** Under **Configure routes**: Method **ANY**, Resource path **/items**. Click **Next** → **Next** → **Create**.

**11.** Copy the **Invoke URL** shown on the API detail page (e.g. `https://abc123.execute-api.eu-central-1.amazonaws.com`).

---

### Part D — Test the API

**12.** Open CloudShell (or a terminal) and POST a new item:

```bash
curl -X POST https://<your-invoke-url>/items \
  -H "Content-Type: application/json" \
  -d '{"name": "my first item", "category": "test"}'
```

You should receive a JSON response with a new `itemId`.

**13.** GET all items:

```bash
curl https://<your-invoke-url>/items
```

**14.** Open **DynamoDB** → **Explore items** on your `lab02-items` table — confirm the item appears.

---

## Verification

- POST returns `201` with a UUID `itemId` ✅
- GET returns a JSON array containing your item ✅
- Item visible in DynamoDB console → Explore items ✅

---

## Cleanup

1. API Gateway → your API → **Delete**
2. Lambda → `lab02-crud-handler` → **Delete**
3. DynamoDB → `lab02-items` → **Delete table**

---

## Key Exam Concepts

| Concept | What to Know |
|---------|-------------|
| **HTTP API vs REST API** | HTTP APIs are cheaper and lower-latency; REST APIs offer more features (usage plans, caching, WAF) |
| **Lambda execution role** | The role the function assumes at runtime — must include permissions for every AWS service the function calls |
| **DynamoDB On-Demand** | No capacity planning; scales instantly; billed per request — ideal for unpredictable workloads |
| **Serverless = no idle cost** | Lambda and DynamoDB On-Demand charge nothing when not in use |
| **Proxy integration** | API Gateway passes the full HTTP event to Lambda and returns Lambda's response as-is |
