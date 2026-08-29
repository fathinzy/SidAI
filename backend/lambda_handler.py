"""
AWS Lambda entry point for SmartLorry, behind API Gateway HTTP API (payload v2.0).

One Lambda serves all routes so the warm container reuses the loaded ML models
(cheaper + faster than one Lambda per route, and friendlier to the free tier).
"""

import json

from router import dispatch


def handler(event, context):
    # API Gateway HTTP API (payload format 2.0)
    ctx = event.get("requestContext", {}).get("http", {})
    method = ctx.get("method") or event.get("httpMethod", "GET")
    path = ctx.get("path") or event.get("rawPath") or event.get("path", "/")

    # query params
    query = event.get("queryStringParameters") or {}

    # body (may be base64 / string)
    raw = event.get("body")
    body = {}
    if raw:
        try:
            body = json.loads(raw)
        except (ValueError, TypeError):
            body = {}

    status, headers, out = dispatch(method, path, query=query, body=body)
    return {"statusCode": status, "headers": headers, "body": out}
