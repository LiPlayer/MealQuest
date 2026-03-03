# Scripts Catalog

This directory contains repository automation scripts grouped by purpose.

## Repository

- `repo-task.js`: monorepo bootstrap/lint/typecheck/test orchestration.
- `check-encoding.js`: UTF-8 encoding guard.
- `verify-all.ps1` / `verify-all.sh`: local full verification shortcuts.

## Server

- `start-server.ps1` / `start-server.sh`: local backend startup.
- `start-server-lan.ps1` / `start-server-lan.sh`: LAN-accessible backend startup.

## Merchant App

- `start-merchant-app.ps1` / `start-merchant-app.sh`: Expo merchant app startup (dev client).

## Customer App

- `start-customer-weapp.ps1`: Taro WeApp startup.

## Release / Contract

- `release-local.js`: local release helper.
- `verify-config-contract.js`: config contract verification.
