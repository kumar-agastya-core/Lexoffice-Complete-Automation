'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Bot, ArrowUp, Paperclip, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface ConversationRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

const AUTH = `Bearer ${process.env.NEXT_PUBLIC_DASHBOARD_SECRET ?? ''}`;

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'gerade eben';
    if (mins < 60) return `vor ${mins} Min.`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `vor ${hours} Std.`;
    return d.toLocaleDateString('de-DE');
  } catch {
    return '';
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function renderAssistantContent(text: string) {
  const paragraphs = text.split('\n\n');
  return paragraphs.map((para, pi) => {
    const lines = para.split('\n');
    return (
      <p key={pi} className={pi > 0 ? 'mt-2' : ''}>
        {lines.map((line, li) => {
          const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
          return (
            <span key={li}>
              {li > 0 && <br />}
              {parts.map((part, i) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                  return <strong key={i}>{part.slice(2, -2)}</strong>;
                }
                if (part.startsWith('`') && part.endsWith('`')) {
                  return (
                    <code key={i} className="rounded bg-background px-1 font-mono text-xs">
                      {part.slice(1, -1)}
                    </code>
                  );
                }
                return <span key={i}>{part}</span>;
              })}
            </span>
          );
        })}
      </p>
    );
  });
}

export default function AssistentPage() {
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [attachedJobId, setAttachedJobId] = useState<string | null>(null);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/agent/conversations', { headers: { Authorization: AUTH } });
      if (res.ok) {
        const data = await res.json() as { conversations: ConversationRow[] };
        setConversations(data.conversations);
      }
    } finally {
      setLoadingConvs(false);
    }
  }, []);

  useEffect(() => { void loadConversations(); }, [loadConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  async function createConversation() {
    const res = await fetch('/api/agent/conversations', {
      method: 'POST',
      headers: { Authorization: AUTH },
    });
    if (res.ok) {
      const data = await res.json() as { id: string };
      setActiveId(data.id);
      setMessages([]);
      await loadConversations();
    }
  }

  async function loadConversation(id: string) {
    setActiveId(id);
    const res = await fetch(`/api/agent/conversations/${id}`, {
      headers: { Authorization: AUTH },
    });
    if (res.ok) {
      const data = await res.json() as { conversation: ConversationRow; messages: MessageRow[] };
      setMessages(data.messages);
    }
  }

  async function deleteConversation(id: string) {
    await fetch(`/api/agent/conversations/${id}`, {
      method: 'DELETE',
      headers: { Authorization: AUTH },
    });
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
    await loadConversations();
  }

  async function handleFileAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: AUTH },
        body: fd,
      });
      if (res.ok) {
        const data = await res.json() as { jobId?: string };
        setAttachedJobId(data.jobId ?? 'uploaded');
        toast.success('PDF angehängt');
      } else {
        toast.error('Upload fehlgeschlagen');
      }
    } catch {
      toast.error('Netzwerkfehler');
    }
    e.target.value = '';
  }

  async function handleSend() {
    if (!activeId || !input.trim() || isStreaming) return;

    const userMessage = input.trim();
    setInput('');
    setIsStreaming(true);
    setStreamingText('');

    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: 'user', content: userMessage, created_at: new Date().toISOString() },
    ]);

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: AUTH },
        body: JSON.stringify({
          conversationId: activeId,
          message: userMessage,
          attachedFileJobId: attachedJobId,
        }),
      });

      if (!res.ok || !res.body) {
        toast.error('Fehler beim Senden');
        setIsStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6)) as { type: string; delta?: string; message?: string };
            if (event.type === 'text' && event.delta) {
              accumulated += event.delta;
              setStreamingText(accumulated);
            } else if (event.type === 'done') {
              setMessages((prev) => [
                ...prev,
                {
                  id: `ass-${Date.now()}`,
                  role: 'assistant',
                  content: accumulated,
                  created_at: new Date().toISOString(),
                },
              ]);
              setStreamingText('');
              await loadConversations();
            } else if (event.type === 'error') {
              toast.error(event.message ?? 'Fehler');
            }
          } catch {
            // malformed SSE line — skip
          }
        }
      }
    } catch {
      toast.error('Netzwerkfehler');
    } finally {
      setIsStreaming(false);
      setAttachedJobId(null);
    }
  }

  const activeConv = conversations.find((c) => c.id === activeId);
  const textareaRows = Math.min(5, Math.max(1, (input.match(/\n/g) ?? []).length + 1));

  return (
    <div className="-m-6 flex h-screen overflow-hidden">
      {/* LEFT SIDEBAR */}
      <aside className="hidden w-64 shrink-0 flex-col border-r md:flex">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="font-semibold">Assistent</span>
          <Button size="sm" variant="ghost" onClick={createConversation}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="space-y-0.5 p-2">
            {loadingConvs ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))
            ) : conversations.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                Noch keine Unterhaltungen
              </p>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`group flex items-center gap-1 rounded-md px-2 py-2 hover:bg-accent ${activeId === conv.id ? 'bg-accent' : ''}`}
                >
                  <button
                    className="flex-1 text-left"
                    onClick={() => void loadConversation(conv.id)}
                  >
                    <p className="truncate text-sm font-medium">{conv.title}</p>
                    <p className="text-xs text-muted-foreground">{formatRelative(conv.updated_at)}</p>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
                    onClick={() => void deleteConversation(conv.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* MAIN AREA */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* TOP BAR */}
        <div className="border-b px-6 py-3">
          <p className="font-medium">
            {activeConv?.title ?? 'Wählen Sie eine Unterhaltung'}
          </p>
        </div>

        {/* MESSAGE THREAD */}
        <ScrollArea className="flex-1">
          <div className="mx-auto max-w-3xl space-y-6 p-6">
            {!activeId ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-center text-muted-foreground">
                <Bot className="h-12 w-12" />
                <h2 className="text-lg font-semibold text-foreground">Wie kann ich helfen?</h2>
                <p className="text-sm">
                  Stellen Sie Fragen zu Ihren Belegen oder laden Sie ein PDF hoch
                </p>
                <Button variant="outline" onClick={createConversation} className="mt-2">
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Neue Unterhaltung starten
                </Button>
              </div>
            ) : (
              <>
                {messages.map((msg) => (
                  <div key={msg.id}>
                    {msg.role === 'user' ? (
                      <div className="flex justify-end">
                        <div className="max-w-[70%]">
                          <div className="rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                            {msg.content}
                          </div>
                          <p className="mt-1 text-right text-xs text-muted-foreground">
                            {formatTime(msg.created_at)}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3">
                        <Avatar className="h-7 w-7 shrink-0 bg-muted">
                          <AvatarFallback className="text-xs"><Bot className="h-4 w-4" /></AvatarFallback>
                        </Avatar>
                        <div className="max-w-[70%]">
                          <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5 text-sm">
                            {renderAssistantContent(msg.content)}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatTime(msg.created_at)}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {isStreaming && (
                  <div className="flex items-start gap-3">
                    <Avatar className="h-7 w-7 shrink-0 bg-muted">
                      <AvatarFallback className="text-xs"><Bot className="h-4 w-4" /></AvatarFallback>
                    </Avatar>
                    <div className="max-w-[70%]">
                      <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5 text-sm">
                        {streamingText ? (
                          <span>
                            {renderAssistantContent(streamingText)}
                            <span className="animate-pulse">▊</span>
                          </span>
                        ) : (
                          <div className="flex gap-1">
                            <Skeleton className="h-2 w-2 rounded-full" />
                            <Skeleton className="h-2 w-2 rounded-full" style={{ animationDelay: '0.15s' }} />
                            <Skeleton className="h-2 w-2 rounded-full" style={{ animationDelay: '0.3s' }} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </>
            )}
          </div>
        </ScrollArea>

        {/* BOTTOM INPUT BAR */}
        <div className="border-t p-4">
          <div className="mx-auto max-w-3xl">
            {attachedJobId && (
              <div className="mb-2">
                <Badge variant="secondary" className="text-xs">
                  PDF angehängt
                </Badge>
              </div>
            )}
            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => void handleFileAttach(e)}
              />
              <Button
                variant="ghost"
                size="icon"
                disabled={!activeId}
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !isStreaming) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder={activeId ? 'Nachricht eingeben…' : 'Erstellen Sie zuerst eine Unterhaltung'}
                disabled={!activeId || isStreaming}
                rows={textareaRows}
                className="flex-1 resize-none"
              />
              <Button
                size="icon"
                disabled={!activeId || isStreaming || !input.trim()}
                onClick={() => void handleSend()}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
