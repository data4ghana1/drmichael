# Data4Ghana — API Documentation

This backend handles automated fulfillment for Data Bundles, AFA Registrations, and E-Card PIN dispensing across multiple providers.

**Base URL**: `https://data4ghana.com`

---

## 1. Data Bundles
### `POST /api/buy-data`
Purchase MTN, Telecel, or Ishare (AirtelTigo) data bundles.

**Headers**:
- `Content-Type`: `application/json`

**Request Body**:
| Field | Type | Description |
| :--- | :--- | :--- |
| `agent_id` | UUID | The unique ID of the purchasing agent. |
| `phone` | String | Recipient phone number (e.g., 024xxxxxxx). |
| `network` | String | `MTN`, `Telecel`, or `Ishare`. |
| `plan_gb` | Number | Size in GB (e.g., 2, 5, 10). |
| `plan_cost` | Number | Cost in GHS to deduct from wallet. |

**Success Response (201 Created)**:
```json
{
  "success": true,
  "message": "5GB MTN data order placed for 0241234567.",
  "order_id": "uuid",
  "provider": "Since",
  "reference": "provider-ref-123",
  "new_balance": 45.50
}
```

---

## 2. AFA Registration
### `POST /api/register-afa`
Submits an AFA Normal registration via the 'Since' activation engine.

**Request Body**:
| Field | Type | Description |
| :--- | :--- | :--- |
| `agent_id` | UUID | The unique ID of the purchasing agent. |
| `full_name` | String | Customer's full name. |
| `phone` | String | Recipient phone number. |
| `ghana_card` | String | Ghana Card ID (GHA-XXXXXXXXX-X). |
| `dob` | String | Date of birth (YYYY-MM-DD). |
| `id_front_url` | String | Path to uploaded ID front image. |
| `id_back_url` | String | Path to uploaded ID back image. |
| `tier` | String | `normal` or `premium`. |

**Success Response (201 Created)**:
```json
{
  "success": true,
  "message": "AFA registration submitted for John Doe.",
  "registration_id": "uuid",
  "reference": "since-ref-999",
  "new_balance": 85.00
}
```

---

## 3. E-Cards (Automated PINs)
### `POST /api/buy-ecard`
Securely purchases and instantly reveals a PIN for WASSCE or BECE.

**Request Body**:
| Field | Type | Description |
| :--- | :--- | :--- |
| `agent_id` | UUID | The unique ID of the purchasing agent. |
| `phone` | String | Recipient phone number for SMS notification. |
| `product` | String | `ecard_wassce` or `ecard_bece`. |

**Success Response (201 Created)**:
```json
{
  "success": true,
  "message": "ECARD_WASSCE E-Card dispensed successfully.",
  "pin": "1234567890",
  "serial": "SN999888",
  "order_id": "uuid",
  "new_balance": 120.00
}
```

---

## 4. Webhook Callbacks
### `POST /webhook/mtn-update`
Handle status updates from third-party providers.

**Sample Payload**:
```json
{
  "reference": "provider-ref-123",
  "status": "completed",
  "phone": "0241234567"
}
```

---

## 5. Setup & Environment
Ensure the following keys are present in your `.env`:
- `SUPABASE_URL`: Your project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: Service role for DB operations.
- `CLEANHEART_API_KEY`: API key for 'Since' engine.
- `SMS_API_URL` & `SMS_API_KEY`: Required for automated notifications.
