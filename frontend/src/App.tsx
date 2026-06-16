import { DeflyWalletConnect } from '@blockshake/defly-connect'
import { DaffiWalletConnect } from '@daffiwallet/connect'
import { PeraWalletConnect } from '@perawallet/connect'
import LuteConnect from 'lute-connect'
import { PROVIDER_ID, ProvidersArray, WalletProvider, useInitializeProviders } from '@txnlab/use-wallet'
import algosdk from 'algosdk'
import { useEffect } from 'react'
import { SnackbarProvider } from 'notistack'
import { ConfigProvider, theme } from 'antd'
import { PoolDataProvider } from './context/PoolDataContext'
import Home from './Home'
import { getAlgodConfigFromViteEnvironment, getKmdConfigFromViteEnvironment } from './utils/network/getAlgoClientConfigs'
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { PreferencesProvider } from './contexts/PreferencesContext';
import { ChainProvider } from './context/ChainContext';
import { VoiWalletProvider } from './context/VoiWalletContext';
import { authService } from './services/AuthService';
import { setupChainIdInterceptor } from './utils/chainApi';

// Add X-Chain-Id header to all axios requests (reads from localStorage)
setupChainIdInterceptor();

let providersArray: ProvidersArray
if (import.meta.env.VITE_ALGOD_NETWORK === '') {
  const kmdConfig = getKmdConfigFromViteEnvironment()

  providersArray = [
    {
      id: PROVIDER_ID.KMD,
      clientOptions: {
        wallet: kmdConfig.wallet,
        password: import.meta.env.VITE_KMD_PASSWORD || '',
        host: kmdConfig.server,
        token: String(kmdConfig.token),
        port: String(kmdConfig.port),
      },
    },
  ]
} else {
  providersArray = [
    { id: PROVIDER_ID.DEFLY, clientStatic: DeflyWalletConnect },
    { id: PROVIDER_ID.PERA, clientStatic: PeraWalletConnect },
    { id: PROVIDER_ID.DAFFI, clientStatic: DaffiWalletConnect },
    { id: PROVIDER_ID.EXODUS },
    { id: PROVIDER_ID.LUTE, clientStatic: LuteConnect, clientOptions: { siteName: 'Fry Farm' } },
    // If you are interested in WalletConnect v2 provider
    // refer to https://github.com/TxnLab/use-wallet for detailed integration instructions
  ]
}

function AppInner() {
  const { isDark } = useTheme();

  useEffect(() => {
    authService.checkAuth();
  }, []);

  const algodConfig = getAlgodConfigFromViteEnvironment()

  const walletProviders = useInitializeProviders({
    providers: providersArray,
    nodeConfig: {
      network: algodConfig.network,
      nodeServer: algodConfig.server,
      nodePort: String(algodConfig.port),
      nodeToken: String(algodConfig.token),
    },
    algosdkStatic: algosdk,
  })

  return (
    <ConfigProvider theme={{ algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm }}>
      <SnackbarProvider maxSnack={3}>
        <WalletProvider value={walletProviders}>
          <VoiWalletProvider>
          <PoolDataProvider>
            <ToastContainer
              position="top-right"
              autoClose={3000}
              hideProgressBar={false}
              newestOnTop={false}
              closeOnClick
              rtl={false}
              pauseOnFocusLoss
              draggable
              pauseOnHover
              theme={isDark ? "dark" : "light"}
            />
            <div className="min-h-screen">
              <Home />
            </div>
          </PoolDataProvider>
          </VoiWalletProvider>
        </WalletProvider>
      </SnackbarProvider>
    </ConfigProvider>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <PreferencesProvider>
        <ChainProvider>
          <AppInner />
        </ChainProvider>
      </PreferencesProvider>
    </ThemeProvider>
  )
}
