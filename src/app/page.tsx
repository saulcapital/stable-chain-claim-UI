"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";

declare global {
  interface Window {
    ethereum?: any;
  }
}

interface TokenData {
  accumulated: string;
  unclaimed: string;
  pending: string;
  decimals: number;
  symbol: string;
  proof: string[];
}

interface MerklResponse {
  [chainId: string]: {
    campaignData: any;
    tokenData: {
      [tokenAddress: string]: TokenData;
    };
  };
}

export default function Home() {
  const [account, setAccount] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [currentChainId, setCurrentChainId] = useState<number | null>(null);

  const USDT_TOKEN = "0xAB067d0832D40619EF445B7fAE510f5Da606Ab0A";
  const MERKL_DISTRIBUTOR = "0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae";
  const CLAIM_FUNCTION_SELECTOR = "0x71ee95c0";

  const addStableNetwork = async () => {
    if (typeof window.ethereum !== "undefined") {
      try {
        setError("🔧 Adding Stable Mainnet to your wallet...");
        
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0x3dc", // 988 in hex
              chainName: "Stable Mainnet",
              nativeCurrency: {
                name: "gUSDT",
                symbol: "gUSDT",
                decimals: 6,
              },
              rpcUrls: ["https://rpc.stablechain.app"],
              blockExplorerUrls: ["https://stablescan.xyz/"],
            },
          ],
        });
        
        setError("✅ Stable Mainnet added successfully!");
        
        // Refresh network status
        setTimeout(async () => {
          if (provider) {
            const network = await provider.getNetwork();
            setCurrentChainId(Number(network.chainId));
            if (Number(network.chainId) === 988) {
              setError("🎉 Successfully switched to Stable Mainnet!");
              fetchMerklRewards(account!);
            }
          }
        }, 1000);
      } catch (error) {
        setError("❌ Failed to add network: " + (error as Error).message);
      }
    }
  };

  const switchToStableNetwork = async () => {
    if (typeof window.ethereum !== "undefined") {
      try {
        // Try to add the network first (more reliable than switching)
        await addStableNetwork();
      } catch (error: any) {
        console.error("Failed to add network:", error);
        setError("Failed to add Stable Mainnet to wallet");
      }
    }
  };

  const connectWallet = async () => {
    if (typeof window.ethereum !== "undefined") {
      try {
        setError("🔌 Connecting to wallet...");
        
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        const network = await provider.getNetwork();
        
        setAccount(address);
        setProvider(provider);
        setCurrentChainId(Number(network.chainId));
        
        setError("✅ Wallet connected successfully!");
        
        // Check if we're on the correct network
        if (Number(network.chainId) !== 988) {
          setError("⚠️ Please switch to Stable Mainnet (Chain ID: 988)");
        }
      } catch (error) {
        setError("❌ Failed to connect wallet");
      }
    } else {
      setError("❌ MetaMask is not installed");
    }
  };

  const fetchMerklRewards = async (userAddress: string) => {
    setLoading(true);
    setError(null);
    
    try {
      setError("🔍 Fetching rewards from Merkl API...");
      
      const response = await fetch(
        `https://api.merkl.xyz/v3/rewards?user=${userAddress}`
      );
      const data: MerklResponse = await response.json();
      
      setError("✅ Successfully fetched rewards data");
      
      // Look for chain ID 988 (Stable Chain)
      const stableChainData = data["988"];
      if (!stableChainData) {
        setError("❌ No rewards found on Stable Chain");
        return;
      }

      // Find USDT token data
      const usdtTokenData = stableChainData.tokenData[USDT_TOKEN];
      if (!usdtTokenData) {
        setError("❌ No USDT rewards found");
        return;
      }

      // Check if there are unclaimed rewards
      if (usdtTokenData.unclaimed === "0") {
        setError("ℹ️ No unclaimed USDT rewards available");
        return;
      }

      setError("💰 Found unclaimed USDT rewards!");
      setTokenData(usdtTokenData);
    } catch (error) {
      setError("❌ Failed to fetch rewards data");
    } finally {
      setLoading(false);
    }
  };

  const generateClaimHex = (userAddress: string, amount: string, proofs: string[]) => {
    // Manual ABI encoding for the claim function
    let data = CLAIM_FUNCTION_SELECTOR.slice(2); // Remove 0x
    
    // Offset positions (4 dynamic arrays)
    data += "0000000000000000000000000000000000000000000000000000000000000080"; // users array offset
    data += "00000000000000000000000000000000000000000000000000000000000000c0"; // tokens array offset
    data += "0000000000000000000000000000000000000000000000000000000000000100"; // amounts array offset
    data += "0000000000000000000000000000000000000000000000000000000000000140"; // proofs array offset
    
    // Encode users array
    data += "0000000000000000000000000000000000000000000000000000000000000001"; // length = 1
    data += userAddress.slice(2).toLowerCase().padStart(64, "0"); // address
    
    // Encode tokens array
    data += "0000000000000000000000000000000000000000000000000000000000000001"; // length = 1
    data += USDT_TOKEN.slice(2).toLowerCase().padStart(64, "0"); // address
    
    // Encode amounts array
    data += "0000000000000000000000000000000000000000000000000000000000000001"; // length = 1
    data += BigInt(amount).toString(16).padStart(64, "0"); // amount
    
    // Encode proofs array (array of arrays)
    data += "0000000000000000000000000000000000000000000000000000000000000001"; // outer array length = 1
    data += "0000000000000000000000000000000000000000000000000000000000000020"; // offset to first inner array
    
    // Encode inner proofs array
    data += proofs.length.toString(16).padStart(64, "0"); // inner array length
    for (const proof of proofs) {
      data += proof.slice(2); // each proof (32 bytes)
    }
    
    return "0x" + data;
  };

  const claimRewards = async () => {
    if (!account || !tokenData || !provider) return;
    
    setLoading(true);
    setError(null);
    
    try {
      setError("🔧 Generating claim transaction...");
      
      const signer = await provider.getSigner();
      
      // Generate hex data
      const hexData = generateClaimHex(account, tokenData.unclaimed, tokenData.proof);
      
      setError("📝 Transaction created, waiting for your approval...");
      
      // Create transaction
      const tx = {
        to: MERKL_DISTRIBUTOR,
        data: hexData,
        value: "0x0",
      };
      
      setError("⏳ Sending transaction to blockchain...");
      
      // Send transaction
      const transaction = await signer.sendTransaction(tx);
      
      setError(`🔄 Transaction submitted! Hash: ${transaction.hash.slice(0, 10)}...`);
      
      setError("⏳ Waiting for transaction confirmation...");
      
      await transaction.wait();
      
      setError("🎉 Transaction successful! Rewards claimed!");
      setTokenData(null); // Refresh data
    } catch (error: any) {
      if (error.code === 4001) {
        setError("❌ You rejected the transaction");
      } else {
        setError("❌ Transaction failed: " + (error as Error).message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (account) {
      fetchMerklRewards(account);
    }
  }, [account]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 font-sans">
      <div className="w-full max-w-md p-8 bg-slate-800 rounded-xl shadow-2xl border border-slate-700">
        <h1 className="text-3xl font-bold text-center mb-8 text-white">Stable Phase 2 predeposit USDT0 claim</h1>
        
        {!account ? (
          <button
            onClick={connectWallet}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-all transform hover:scale-105 font-medium"
          >
            Connect Wallet
          </button>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-slate-700 rounded-lg text-sm text-slate-300">
              Connected: {account.slice(0, 6)}...{account.slice(-4)}
            </div>
            
            {currentChainId !== 988 && (
              <div className="space-y-3">
                <div className="p-4 bg-amber-900/50 border border-amber-700 text-amber-200 rounded-lg text-sm">
                  <div className="font-medium mb-1">⚠️ Network Required</div>
                  Please switch to Stable Mainnet to claim rewards
                </div>
                <button
                  onClick={switchToStableNetwork}
                  className="w-full bg-amber-600 text-white py-3 px-4 rounded-lg hover:bg-amber-700 transition-all transform hover:scale-105 font-medium"
                >
                  Add Stable Mainnet
                </button>
              </div>
            )}
            
            {loading && (
              <div className="text-center text-slate-400 py-4">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                <div className="mt-2">Loading...</div>
              </div>
            )}
            
            {error && (
              <div className={`p-4 rounded-lg text-sm ${
                error.includes("successful") 
                  ? "bg-green-900/50 border border-green-700 text-green-200" 
                  : "bg-red-900/50 border border-red-700 text-red-200"
              }`}>
                {error}
              </div>
            )}
            
            {currentChainId === 988 && tokenData && (
              <div className="space-y-4">
                <div className="p-6 bg-slate-700 rounded-lg border border-slate-600">
                  <h3 className="font-semibold mb-3 text-white">Available Rewards</h3>
                  <p className="text-2xl font-bold text-green-400">
                    {(Number(tokenData.unclaimed) / 1e6).toFixed(6)} USDT
                  </p>
                  <p className="text-xs text-slate-400 mt-2">
                    on Stable Mainnet
                  </p>
                </div>
                
                <button
                  onClick={claimRewards}
                  disabled={loading}
                  className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 transition-all transform hover:scale-105 disabled:bg-slate-600 disabled:transform-none font-medium"
                >
                  {loading ? "Processing..." : "Claim Rewards"}
                </button>
              </div>
            )}
            
            {currentChainId === 988 && !tokenData && !loading && (
              <div className="p-6 bg-slate-700 rounded-lg border border-slate-600 text-center text-slate-400">
                <div className="text-lg mb-2">No Rewards Found</div>
                <div className="text-sm">No unclaimed USDT rewards available</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
