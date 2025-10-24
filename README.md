# Shout Out - Netlify

Sales celebration system that polls ServiceTitan API for sold estimates and posts celebrations to Google Chat.

## Overview

This application replaces the legacy Google Apps Script system by polling the ServiceTitan API directly every 1-2 minutes to detect:
- **TGLs**: System Update sales (amount = $0, Option C)
- **Big Sales**: Estimates over $700

## Features

- Direct ServiceTitan API integration (bypasses unreliable SMS)
- Supabase database for logging and state management
- Web dashboard for monitoring polls, estimates, and notifications
- Automated posting to Google Chat with random celebration GIFs
- Google Sheets logging (future phase)

## Tech Stack

- **Backend**: Netlify Functions (TypeScript)
- **Frontend**: React + Vite + TypeScript
- **Database**: Supabase
- **Scheduling**: GitHub Actions (cron)
- **Integrations**: ServiceTitan API, Google Chat

## Getting Started

Documentation and setup instructions coming soon.

## Project Status

🚧 **In Development** - Initial setup phase
