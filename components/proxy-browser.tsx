"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Home,
  Plus,
  X,
  Globe,
  Loader2,
  AlertCircle,
  Shield,
  ShieldAlert,
  StopCircle,
  Star,
  Menu,
  History,
  Settings,
  Download,
} from "lucide-react"
import { fetchThroughProxy, formatUrl, type ProxyResponse } from "@/lib/proxy-utils"
import { SessionManager } from "@/lib/session-manager"
import { BookmarksPanel } from "@/components/bookmarks-panel"

interface Tab {
  id: string
  title: string
  url: string
  isActive: boolean
  isLoading?: boolean
  favicon?: string
  content?: string
  error?: string
  history: string[]
  historyIndex: number
  isSecure?: boolean
}

export function ProxyBrowser() {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [currentUrl, setCurrentUrl] = useState("")
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  // Load session on mount
  useEffect(() => {
    const session = SessionManager.loadSession()
    setTabs(session.tabs)
    const activeTab = session.tabs.find((tab) => tab.isActive)
    setCurrentUrl(activeTab?.url || "")
  }, [])

  // Save session whenever tabs change
  useEffect(() => {
    if (tabs.length > 0) {
      SessionManager.saveSession({ tabs })
    }
  }, [tabs])

  const activeTab = tabs.find((tab) => tab.isActive)

  const addTab = () => {
    const activeIndex = tabs.findIndex((tab) => tab.isActive)
    const newTab: Tab = {
      id: Date.now().toString(),
      title: "New Tab",
      url: "",
      isActive: true,
      history: [],
      historyIndex: -1,
    }

    const newTabs = tabs.map((tab) => ({ ...tab, isActive: false }))
    newTabs.splice(activeIndex + 1, 0, newTab)

    setTabs(newTabs)
    setCurrentUrl("")
  }

  const closeTab = (tabId: string) => {
    if (tabs.length === 1) return

    const tabIndex = tabs.findIndex((tab) => tab.id === tabId)
    const isClosingActive = tabs[tabIndex]?.isActive
    const newTabs = tabs.filter((tab) => tab.id !== tabId)

    if (isClosingActive && newTabs.length > 0) {
      const nextActiveIndex = tabIndex < newTabs.length ? tabIndex : newTabs.length - 1
      newTabs[nextActiveIndex].isActive = true
      setCurrentUrl(newTabs[nextActiveIndex].url)
    }

    setTabs(newTabs)
  }

  const switchTab = (tabId: string) => {
    const newTabs = tabs.map((tab) => ({
      ...tab,
      isActive: tab.id === tabId,
    }))
    setTabs(newTabs)
    const activeTab = newTabs.find((tab) => tab.isActive)
    setCurrentUrl(activeTab?.url || "")
  }

  const navigateToUrl = async (url?: string, addToHistory = true) => {
    const targetUrl = url || currentUrl.trim()
    if (!targetUrl) return

    const formattedUrl = formatUrl(targetUrl)

    setCurrentUrl(formattedUrl)

    setTabs((prev) =>
      prev.map((tab) => (tab.isActive ? { ...tab, isLoading: true, error: undefined, content: undefined } : tab)),
    )

    try {
      const proxyResponse: ProxyResponse = await fetchThroughProxy(formattedUrl)

      setTabs((prev) =>
        prev.map((tab) => {
          if (!tab.isActive) return tab

          let newHistory = tab.history
          let newHistoryIndex = tab.historyIndex

          if (addToHistory) {
            // Remove any forward history if we're navigating to a new page
            newHistory = tab.history.slice(0, tab.historyIndex + 1)
            newHistory.push(formattedUrl)
            newHistoryIndex = newHistory.length - 1
          }

          return {
            ...tab,
            url: formattedUrl,
            title: proxyResponse.title || new URL(formattedUrl).hostname,
            isLoading: false,
            favicon: proxyResponse.favicon,
            content: proxyResponse.content,
            error: undefined,
            history: newHistory,
            historyIndex: newHistoryIndex,
            isSecure: formattedUrl.startsWith("https://"),
          }
        }),
      )

      // Add to global history
      if (addToHistory) {
        SessionManager.addToHistory({
          title: proxyResponse.title || new URL(formattedUrl).hostname,
          url: formattedUrl,
          favicon: proxyResponse.favicon,
        })
      }
    } catch (error) {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.isActive
            ? {
                ...tab,
                isLoading: false,
                error: error instanceof Error ? error.message : "Failed to load page",
                title: "Error - " + (formattedUrl ? new URL(formattedUrl).hostname : "Unknown"),
                isSecure: false,
              }
            : tab,
        ),
      )
    }
  }

  const goBack = async () => {
    if (!activeTab || activeTab.historyIndex <= 0) return

    const prevUrl = activeTab.history[activeTab.historyIndex - 1]

    setTabs((prev) => prev.map((tab) => (tab.isActive ? { ...tab, historyIndex: tab.historyIndex - 1 } : tab)))

    await navigateToUrl(prevUrl, false)
  }

  const goForward = async () => {
    if (!activeTab || activeTab.historyIndex >= activeTab.history.length - 1) return

    const nextUrl = activeTab.history[activeTab.historyIndex + 1]

    setTabs((prev) => prev.map((tab) => (tab.isActive ? { ...tab, historyIndex: tab.historyIndex + 1 } : tab)))

    await navigateToUrl(nextUrl, false)
  }

  const refresh = async () => {
    if (!activeTab?.url) return
    await navigateToUrl(activeTab.url, false)
  }

  const stopLoading = () => {
    setTabs((prev) => prev.map((tab) => (tab.isActive ? { ...tab, isLoading: false } : tab)))
  }

  const goHome = () => {
    setCurrentUrl("")
    setTabs((prev) =>
      prev.map((tab) =>
        tab.isActive
          ? {
              ...tab,
              url: "",
              title: "New Tab",
              favicon: undefined,
              content: undefined,
              error: undefined,
              isSecure: undefined,
            }
          : tab,
      ),
    )
  }

  const clearBrowsingData = () => {
    if (confirm("Are you sure you want to clear all browsing data? This cannot be undone.")) {
      SessionManager.clearAllData()
      // Reset to default state
      const defaultTab: Tab = {
        id: Date.now().toString(),
        title: "New Tab",
        url: "",
        isActive: true,
        history: [],
        historyIndex: -1,
      }
      setTabs([defaultTab])
      setCurrentUrl("")
      setShowMenu(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      navigateToUrl()
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case "t":
            e.preventDefault()
            addTab()
            break
          case "w":
            e.preventDefault()
            if (tabs.length > 1) {
              const activeTabId = activeTab?.id
              if (activeTabId) closeTab(activeTabId)
            }
            break
          case "r":
            e.preventDefault()
            refresh()
            break
          case "l":
            e.preventDefault()
            // Focus address bar
            const addressBar = document.querySelector('input[placeholder*="URL"]') as HTMLInputElement
            if (addressBar) {
              addressBar.focus()
              addressBar.select()
            }
            break
          case "d":
            e.preventDefault()
            setShowBookmarks((prev) => !prev)
            break
        }
      }

      // Alt + Arrow keys for navigation
      if (e.altKey) {
        switch (e.key) {
          case "ArrowLeft":
            e.preventDefault()
            goBack()
            break
          case "ArrowRight":
            e.preventDefault()
            goForward()
            break
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [tabs, activeTab])

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Tab Bar */}
      <div className="flex items-center bg-card border-b border-border px-2 py-1">
        <div className="flex flex-1 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`
                flex items-center gap-2 px-4 py-2 min-w-[200px] max-w-[250px] 
                border-r border-border cursor-pointer group relative
                ${
                  tab.isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-background/50"
                }
              `}
              onClick={() => switchTab(tab.id)}
            >
              {tab.isLoading ? (
                <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" />
              ) : tab.favicon ? (
                <img src={tab.favicon || "/placeholder.svg"} alt="" className="w-4 h-4 flex-shrink-0" />
              ) : (
                <Globe className="w-4 h-4 flex-shrink-0" />
              )}
              <span className="truncate text-sm font-medium">{tab.title || "New Tab"}</span>
              {tabs.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-5 h-5 p-0 opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(tab.id)
                  }}
                >
                  <X className="w-3 h-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={addTab}
          className="ml-2 hover:bg-accent hover:text-accent-foreground"
          title="New Tab (Ctrl+T)"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {/* Navigation Bar */}
      <div className="flex items-center gap-2 p-3 bg-card border-b border-border relative">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            onClick={goBack}
            disabled={!activeTab || activeTab.historyIndex <= 0}
            title="Back (Alt+←)"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            onClick={goForward}
            disabled={!activeTab || activeTab.historyIndex >= activeTab.history.length - 1}
            title="Forward (Alt+→)"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          {activeTab?.isLoading ? (
            <Button
              variant="ghost"
              size="sm"
              className="hover:bg-accent hover:text-accent-foreground"
              onClick={stopLoading}
              title="Stop Loading"
            >
              <StopCircle className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              onClick={refresh}
              disabled={!activeTab?.url}
              title="Refresh (Ctrl+R)"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="hover:bg-accent hover:text-accent-foreground"
            onClick={goHome}
            title="Home"
          >
            <Home className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 max-w-2xl flex items-center gap-2">
          {activeTab?.url && (
            <div className="flex items-center">
              {activeTab.isSecure ? (
                <Shield className="w-4 h-4 text-green-600" title="Secure Connection" />
              ) : activeTab.url ? (
                <ShieldAlert className="w-4 h-4 text-amber-600" title="Not Secure" />
              ) : null}
            </div>
          )}
          <Input
            value={currentUrl}
            onChange={(e) => setCurrentUrl(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Enter URL or search... (Ctrl+L to focus)"
            className="w-full bg-input border-border focus:ring-ring focus:border-primary"
            disabled={activeTab?.isLoading}
          />
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="hover:bg-accent hover:text-accent-foreground"
            onClick={() => setShowBookmarks(!showBookmarks)}
            title="Bookmarks (Ctrl+D)"
          >
            <Star className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="hover:bg-accent hover:text-accent-foreground"
            onClick={() => setShowMenu(!showMenu)}
            title="Menu"
          >
            <Menu className="w-4 h-4" />
          </Button>
        </div>

        {/* Bookmarks Panel */}
        <BookmarksPanel
          isOpen={showBookmarks}
          onClose={() => setShowBookmarks(false)}
          onNavigate={navigateToUrl}
          currentUrl={activeTab?.url}
          currentTitle={activeTab?.title}
          currentFavicon={activeTab?.favicon}
        />

        {/* Menu Panel */}
        {showMenu && (
          <Card className="absolute top-full right-0 z-50 mt-1 bg-card border border-border shadow-lg min-w-48">
            <div className="p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  // TODO: Implement history panel
                  setShowMenu(false)
                }}
              >
                <History className="w-4 h-4 mr-2" />
                History
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  // TODO: Implement downloads panel
                  setShowMenu(false)
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Downloads
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  // TODO: Implement settings panel
                  setShowMenu(false)
                }}
              >
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
              <hr className="my-2 border-border" />
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-destructive hover:text-destructive"
                onClick={clearBrowsingData}
              >
                Clear Browsing Data
              </Button>
            </div>
          </Card>
        )}
      </div>

      {/* Browser Content Area */}
      <div className="flex-1 bg-background overflow-hidden">
        {activeTab?.content ? (
          <iframe
            srcDoc={activeTab.content}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            title={activeTab.title}
          />
        ) : activeTab?.error ? (
          <Card className="h-full m-4 p-6 bg-card">
            <div className="text-center text-destructive">
              <AlertCircle className="w-16 h-16 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Failed to Load Page</h3>
              <p className="text-sm mb-4">{activeTab.error}</p>
              <Button onClick={() => navigateToUrl()} variant="outline">
                Try Again
              </Button>
            </div>
          </Card>
        ) : activeTab?.url ? (
          <Card className="h-full m-4 p-6 bg-card">
            <div className="text-center text-muted-foreground">
              <Loader2 className="w-16 h-16 mx-auto mb-4 animate-spin" />
              <h3 className="text-lg font-semibold mb-2">Loading...</h3>
              <p className="text-sm">
                Fetching: <span className="font-mono text-primary">{activeTab.url}</span>
              </p>
            </div>
          </Card>
        ) : (
          <Card className="h-full m-4 p-6 bg-card">
            <div className="text-center text-muted-foreground">
              <Globe className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">Welcome to Proxy Browser</h3>
              <p className="text-sm mb-4">Enter a URL in the address bar to get started</p>
              <div className="text-xs opacity-75 space-y-1">
                <p>
                  <kbd className="px-2 py-1 bg-muted rounded text-xs">Ctrl+T</kbd> New Tab
                </p>
                <p>
                  <kbd className="px-2 py-1 bg-muted rounded text-xs">Ctrl+W</kbd> Close Tab
                </p>
                <p>
                  <kbd className="px-2 py-1 bg-muted rounded text-xs">Ctrl+R</kbd> Refresh
                </p>
                <p>
                  <kbd className="px-2 py-1 bg-muted rounded text-xs">Ctrl+L</kbd> Focus Address Bar
                </p>
                <p>
                  <kbd className="px-2 py-1 bg-muted rounded text-xs">Ctrl+D</kbd> Bookmarks
                </p>
                <p>
                  <kbd className="px-2 py-1 bg-muted rounded text-xs">Alt+←/→</kbd> Back/Forward
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
