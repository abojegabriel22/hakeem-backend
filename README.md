# Hakeem booking email API

`POST /api/booking` validates a booking enquiry and emails it to management. The email includes a styled HTML layout, a plain-text alternative, and an optional PDF, DOC, DOCX, or TXT attachment.

## Run locally

1. Copy `.env.example` to `.env` and set the SMTP credentials for the account that will send the enquiry emails.
2. For Gmail, use a Google App Password as `SMTP_PASS`; do not use your normal account password.
3. Run `npm install`, then `npm run dev` (or `npm start`).

The API listens on port `3000` by default. Set `FRONTEND_ORIGIN` to the origin of the frontend; multiple comma-separated origins are supported.

## Connect the booking form

Replace the current `mailto:` submit handler with a request to the API. Send the form's `FormData` directly so the browser includes the optional file; do not set the `Content-Type` header manually.

```tsx
async function handleSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  const form = event.currentTarget
  setStatus('Sending your enquiry…')

  try {
    const response = await fetch('http://localhost:3000/api/booking', {
      method: 'POST',
      body: new FormData(form),
    })
    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || 'Unable to send your enquiry.')
    }

    setStatus(result.message)
    form.reset()
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Unable to send your enquiry.')
  }
}
```

Use the deployed API URL in place of `http://localhost:3000` when deploying. On success, the endpoint responds with `{ "message": "Your booking enquiry has been sent successfully." }`. Validation, attachment, rate-limit, and email-delivery failures return a JSON `{ "error": "..." }` response with an appropriate HTTP status.

## Request limits

- Required: `name`, `company`, `email`, `type`, and `message`.
- `type` must match one of the enquiry categories displayed on the booking form.
- At most one `.pdf`, `.doc`, `.docx`, or `.txt` attachment is accepted; maximum size is 8 MB.
- Maximum 10 submissions per IP address per 15-minute window.
- tiny update to enable auto fetch and also updated github settings with webhook