# Merkl USDT Claim App

A simple web application for claiming USDT rewards from Merkl on Stable Mainnet.

## Features

- **Wallet Connection**: Connect your MetaMask wallet
- **Network Detection**: Automatically detects and prompts to switch to Stable Mainnet
- **Reward Fetching**: Fetches unclaimed USDT rewards from Merkl API
- **One-Click Claiming**: Generate and submit claim transactions directly

## Getting Started

### Prerequisites

- MetaMask browser extension
- Node.js 18+ 

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

### Build

```bash
npm run build
```

### Deploy on Vercel

The easiest way to deploy is using the [Vercel Platform](https://vercel.com/new):

1. Connect your GitHub repository
2. Vercel will automatically detect it's a Next.js app
3. Deploy with default settings

## How It Works

1. **Connect Wallet**: Users connect their MetaMask wallet
2. **Network Check**: App verifies user is on Stable Mainnet (Chain ID: 988)
3. **Fetch Rewards**: Calls Merkl API to get unclaimed USDT rewards
4. **Generate Transaction**: Creates hex data for the claim function
5. **Submit Transaction**: User signs and submits the transaction via MetaMask

## Network Configuration

**Stable Mainnet:**
- Chain ID: 988 (0x3dc)
- RPC URL: https://rpc.stablechain.app
- Currency: gUSDT
- Explorer: https://stablescan.xyz

## Smart Contract Details

- **Distributor**: `0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae`
- **USDT Token**: `0xAB067d0832D40619EF445B7fAE510f5Da606Ab0A`
- **Function Selector**: `0x71ee95c0` (claim function)

## API Integration

Uses the Merkl API endpoint:
```
https://api.merkl.xyz/v3/rewards?user={address}
```

The app specifically looks for:
- Chain ID 988 (Stable Mainnet)
- USDT token address
- Non-zero unclaimed amounts
- Valid proof arrays
