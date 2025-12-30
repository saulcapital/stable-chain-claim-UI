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
      } catch (error) {
        console.error("Failed to add network:", error);
      }
    }
  };

  const switchToStableNetwork = async () => {
    if (typeof window.ethereum !== "undefined") {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x3dc" }],
        });
      } catch (error: any) {
        // This error code indicates that the chain has not been added to MetaMask
        if (error.code === 4902) {
          await addStableNetwork();
        } else {
          console.error("Failed to switch network:", error);
        }
      }
    }
  };

  const connectWallet = async () => {
    if (typeof window.ethereum !== "undefined") {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        const network = await provider.getNetwork();
        
        setAccount(address);
        setProvider(provider);
        setCurrentChainId(Number(network.chainId));
        setError(null);
        
        // Check if we're on the correct network
        if (Number(network.chainId) !== 988) {
          setError("Please switch to Stable Mainnet (Chain ID: 988)");
        }
      } catch (error) {
        setError("Failed to connect wallet");
      }
    } else {
      setError("MetaMask is not installed");
    }
  };

  const fetchMerklRewards = async (userAddress: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(
        `https://api.merkl.xyz/v3/rewards?user=${userAddress}`
      );
      const data: MerklResponse = await response.json();
      
      // Look for chain ID 988 (Stable Chain)
      const stableChainData = data["988"];
      if (!stableChainData) {
        setError("No rewards found on Stable Chain");
        return;
      }

      // Find USDT token data
      const usdtTokenData = stableChainData.tokenData[USDT_TOKEN];
      if (!usdtTokenData) {
        setError("No USDT rewards found");
        return;
      }

      // Check if there are unclaimed rewards
      if (usdtTokenData.unclaimed === "0") {
        setError("No unclaimed USDT rewards available");
        return;
      }

      setTokenData(usdtTokenData);
    } catch (error) {
      setError("Failed to fetch rewards data");
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
      const signer = await provider.getSigner();
      
      // Generate hex data
      const hexData = generateClaimHex(account, tokenData.unclaimed, tokenData.proof);
      
      // Create transaction
      const tx = {
        to: MERKL_DISTRIBUTOR,
        data: hexData,
        value: "0x0",
      };
      
      // Send transaction
      const transaction = await signer.sendTransaction(tx);
      await transaction.wait();
      
      setError("Transaction successful!");
      setTokenData(null); // Refresh data
    } catch (error) {
      setError("Transaction failed: " + (error as Error).message);
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
    <div className="flex min-h-screen items-center justify-center bg-gray-50 font-sans">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-lg">
        <h1 className="text-2xl font-bold text-center mb-8">Merkl USDT Claim</h1>
        
        {!account ? (
          <button
            onClick={connectWallet}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Connect Wallet
          </button>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-gray-600">
              Connected: {account.slice(0, 6)}...{account.slice(-4)}
            </div>
            
            {currentChainId !== 988 && (
              <div className="space-y-3">
                <div className="p-3 bg-yellow-100 text-yellow-700 rounded-lg text-sm">
                  Please switch to Stable Mainnet to claim rewards
                </div>
                <button
                  onClick={switchToStableNetwork}
                  className="w-full bg-orange-600 text-white py-2 px-4 rounded-lg hover:bg-orange-700 transition-colors text-sm"
                >
                  Switch to Stable Mainnet
                </button>
              </div>
            )}
            
            {loading && (
              <div className="text-center text-gray-600">Loading...</div>
            )}
            
            {error && (
              <div className={`p-3 rounded-lg text-sm ${
                error.includes("successful") 
                  ? "bg-green-100 text-green-700" 
                  : "bg-red-100 text-red-700"
              }`}>
                {error}
              </div>
            )}
            
            {currentChainId === 988 && tokenData && (
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-semibold mb-2">Available Rewards</h3>
                  <p className="text-lg">
                    {(Number(tokenData.unclaimed) / 1e6).toFixed(6)} USDT
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    on Stable Mainnet
                  </p>
                </div>
                
                <button
                  onClick={claimRewards}
                  disabled={loading}
                  className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400"
                >
                  {loading ? "Processing..." : "Claim Rewards"}
                </button>
              </div>
            )}
            
            {currentChainId === 988 && !tokenData && !loading && (
              <div className="p-4 bg-gray-50 rounded-lg text-center text-gray-600">
                No unclaimed USDT rewards found
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
