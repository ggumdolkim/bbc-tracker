"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Plus, Calendar, BookOpen, Sparkles, Trash2, Copy, Check } from "lucide-react";

// ---
// BBC 독해 트래커 (MVP)
// - 기사 링크/제목/분야 저장
// - 본문(발췌) 붙여넣기
// - 내 번역/요약/단어 저장
// - ChatGPT 번역 프롬프트 자동 생성(복사)
// - localStorage 저장
// ---

const STORAGE_KEY = "bbc_reading_tracker_v1";

const topicOptions = [
  "Politics",
  "Science",
  "Health",
  "Business",
  "Culture",
  "Opinion",
  "World",
  "Tech",
  "Climate",
  "Other",
];

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + "_" + Date.now().toString(36);
}

function safeParse<T>(json: string | null, fallback: T): T {
  try {
    if (!json) return fallback;
    const v = JSON.parse(json) as T;
    return (v ?? fallback) as T;
  } catch {
    return fallback;
  }
}

function wordCount(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function lineCount(text) {
  if (!text) return 0;
  return text.split(/\n/).length;
}

function buildPrompt(entry) {
  // 사용자가 기사 전체를 붙여넣는 경우를 대비해 "발췌" 권고 포함
  const excerpt = (entry.excerpt || "").trim();
  const myKo = (entry.myTranslation || "").trim();

  return `나는 매일 BBC 기사 1개로 영어 독해 훈련 중이다.\n\n[기사 정보]\n- Title: ${entry.title || "(미입력)"}\n- Link: ${entry.url || "(미입력)"}\n- Topic: ${entry.topic || "(미입력)"}\n- Date: ${entry.date || "(미입력)"}\n\n[원문 발췌]\n${excerpt || "(여기에 기사 문장을 붙여넣어줘. 너무 길면 10~20문장 정도로 발췌)"}\n\n[내 번역(있으면)]\n${myKo || "(아직 없음)"}\n\n요청:\n1) 원문 발췌를 자연스럽게 한국어로 번역해줘.\n2) 내가 번역을 썼다면 어색한 부분을 교정해줘(문장별 코멘트).\n3) 중요한 표현 5개 + 예문 1개씩(짧게).\n4) 기사 핵심 요약: 영어 2문장 + 한국어 2문장.\n5) 단어/표현 10개를 난이도별로(기초/중급/고급) 나눠줘.\n\n주의: 번역은 너무 문어체 말고 자연스럽게.`;
}

function Stat({ icon: Icon, label, value }) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-2xl bg-muted flex items-center justify-center">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold truncate">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function BBCLearningTracker() {
  const [entries, setEntries] = useState(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return safeParse(raw, []);
  });

  const [tab, setTab] = useState("dashboard");
  const [q, setQ] = useState("");
  const [topicFilter, setTopicFilter] = useState("All");

  const [editorOpen, setEditorOpen] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  const active = useMemo(() => entries.find((e) => e.id === activeId) || null, [entries, activeId]);

  const stats = useMemo(() => {
    const total = entries.length;
    const thisWeek = (() => {
      // naive: 최근 7일
      const now = new Date();
      const ms7 = 7 * 24 * 60 * 60 * 1000;
      return entries.filter((e) => {
        const d = new Date(e.date || "");
        return !isNaN(d) && now - d <= ms7;
      }).length;
    })();
    const avgTime = (() => {
      const mins = entries.map((e) => Number(e.minutes || 0)).filter((n) => !isNaN(n) && n > 0);
      if (!mins.length) return 0;
      return Math.round(mins.reduce((a, b) => a + b, 0) / mins.length);
    })();
    const vocab = entries.reduce((sum, e) => sum + (e.vocab?.length || 0), 0);
    return { total, thisWeek, avgTime, vocab };
  }, [entries]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return entries
      .filter((e) => (topicFilter === "All" ? true : (e.topic || "Other") === topicFilter))
      .filter((e) => {
        if (!query) return true;
        const hay = `${e.title || ""} ${e.url || ""} ${e.excerpt || ""} ${e.summaryKo || ""} ${e.summaryEn || ""}`.toLowerCase();
        return hay.includes(query);
      })
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }, [entries, q, topicFilter]);

  function openNew() {
    const id = uid();
    const blank = {
      id,
      date: todayISO(),
      title: "",
      url: "",
      topic: "Health",
      excerpt: "",
      myTranslation: "",
      gptResult: "",
      summaryEn: "",
      summaryKo: "",
      vocab: [],
      minutes: 30,
      difficulty: 3,
      notes: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setEntries((prev) => [blank, ...prev]);
    setActiveId(id);
    setEditorOpen(true);
  }

  function updateActive(patch) {
    if (!activeId) return;
    setEntries((prev) =>
      prev.map((e) => (e.id === activeId ? { ...e, ...patch, updatedAt: Date.now() } : e))
    );
  }

  function removeEntry(id) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setEditorOpen(false);
    }
  }

  async function copyPrompt() {
    if (!active) return;
    const text = buildPrompt(active);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  function addVocab(term) {
    const t = (term || "").trim();
    if (!t) return;
    const curr = active?.vocab || [];
    if (curr.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    updateActive({ vocab: [...curr, t] });
  }

  function removeVocab(term) {
    const curr = active?.vocab || [];
    updateActive({ vocab: curr.filter((x) => x !== term) });
  }

  const VocabPanel = () => {
    const [term, setTerm] = useState("");
    useEffect(() => setTerm(""), [activeId]);
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="단어/표현 추가 (예: more than doubled)"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addVocab(term);
                setTerm("");
              }
            }}
          />
          <Button
            className="rounded-2xl"
            onClick={() => {
              addVocab(term);
              setTerm("");
            }}
          >
            추가
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(active?.vocab || []).length === 0 ? (
            <div className="text-sm text-muted-foreground">아직 단어가 없어요. 오늘 5~10개만 적립!</div>
          ) : (
            (active?.vocab || []).map((v) => (
              <Badge key={v} variant="secondary" className="rounded-2xl px-3 py-1 flex items-center gap-2">
                <span>{v}</span>
                <button
                  className="opacity-70 hover:opacity-100"
                  onClick={() => removeVocab(v)}
                  aria-label="remove"
                >
                  ×
                </button>
              </Badge>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        <header className="flex items-start md:items-center justify-between gap-4 flex-col md:flex-row">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-2xl bg-muted flex items-center justify-center">
                <BookOpen className="h-5 w-5" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold">BBC 독해 트래커</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              하루 1개 기사. 기록 + 번역 프롬프트 + 단어 적립까지 한 번에.
            </p>
          </div>
          <div className="flex gap-2">
            <Button className="rounded-2xl" onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" />새 기록
            </Button>
            <Button
              variant="secondary"
              className="rounded-2xl"
              onClick={() => {
                setTab("log");
              }}
            >
              기록 보기
            </Button>
          </div>
        </header>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="rounded-2xl">
            <TabsTrigger value="dashboard">대시보드</TabsTrigger>
            <TabsTrigger value="log">기록</TabsTrigger>
            <TabsTrigger value="vocab">단어장</TabsTrigger>
            <TabsTrigger value="how">사용법</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Stat icon={Calendar} label="총 기록" value={`${stats.total}개`} />
              <Stat icon={Sparkles} label="최근 7일" value={`${stats.thisWeek}개`} />
              <Stat icon={BookOpen} label="평균 소요" value={`${stats.avgTime}분`} />
              <Stat icon={Search} label="누적 단어" value={`${stats.vocab}개`} />
            </div>

            <Card className="rounded-2xl shadow-sm">
              <CardContent className="p-4 md:p-6 space-y-4">
                <div className="flex items-center justify-between gap-2 flex-col md:flex-row">
                  <div className="font-semibold">오늘 할 일</div>
                  <div className="text-sm text-muted-foreground">권장: 원문 발췌 10~20문장</div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Card className="rounded-2xl">
                    <CardContent className="p-4">
                      <div className="text-sm text-muted-foreground">Step 1</div>
                      <div className="font-semibold">기사 선택 + 발췌 붙여넣기</div>
                      <div className="text-sm mt-2">BBC 링크/제목 저장 → 본문 일부만</div>
                    </CardContent>
                  </Card>
                  <Card className="rounded-2xl">
                    <CardContent className="p-4">
                      <div className="text-sm text-muted-foreground">Step 2</div>
                      <div className="font-semibold">한글 번역 작성</div>
                      <div className="text-sm mt-2">모르는 표현은 그냥 빈칸 처리</div>
                    </CardContent>
                  </Card>
                  <Card className="rounded-2xl">
                    <CardContent className="p-4">
                      <div className="text-sm text-muted-foreground">Step 3</div>
                      <div className="font-semibold">프롬프트 복사 → GPT로 교정</div>
                      <div className="text-sm mt-2">결과를 기록에 붙여넣기</div>
                    </CardContent>
                  </Card>
                </div>
                <div className="flex justify-end">
                  <Button className="rounded-2xl" onClick={openNew}>
                    <Plus className="h-4 w-4 mr-2" />오늘 기록 시작
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <div className="font-semibold">최근 기록</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filtered.slice(0, 4).map((e) => (
                  <Card
                    key={e.id}
                    className="rounded-2xl shadow-sm hover:shadow-md transition cursor-pointer"
                    onClick={() => {
                      setActiveId(e.id);
                      setEditorOpen(true);
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold truncate">{e.title || "(제목 없음)"}</div>
                        <Badge variant="secondary" className="rounded-2xl">
                          {e.topic || "Other"}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground mt-2">
                        {e.date || ""} · 발췌 {wordCount(e.excerpt)} words · 단어 {(e.vocab || []).length}개
                      </div>
                      <div className="text-sm mt-2 line-clamp-2">{e.summaryKo || "요약(한글) 미입력"}</div>
                    </CardContent>
                  </Card>
                ))}
                {filtered.length === 0 && (
                  <div className="text-sm text-muted-foreground">아직 기록이 없어요. 새 기록을 만들어봐.</div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="log" className="space-y-4">
            <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
              <div className="flex items-center gap-2 w-full md:w-1/2">
                <div className="relative w-full">
                  <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="제목/요약/링크 검색"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="h-10 rounded-2xl border bg-background px-3 text-sm"
                  value={topicFilter}
                  onChange={(e) => setTopicFilter(e.target.value)}
                >
                  <option value="All">All topics</option>
                  {topicOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <Button className="rounded-2xl" onClick={openNew}>
                  <Plus className="h-4 w-4 mr-2" />새 기록
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {filtered.map((e) => (
                <Card key={e.id} className="rounded-2xl shadow-sm">
                  <CardContent className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div
                          className="font-semibold truncate cursor-pointer hover:underline"
                          onClick={() => {
                            setActiveId(e.id);
                            setEditorOpen(true);
                          }}
                        >
                          {e.title || "(제목 없음)"}
                        </div>
                        <Badge variant="secondary" className="rounded-2xl">
                          {e.topic || "Other"}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {e.date || ""} · 발췌 {wordCount(e.excerpt)} words ({lineCount(e.excerpt)} lines) · {Number(e.minutes || 0) || 0}분
                      </div>
                      <div className="text-sm mt-2 line-clamp-2">{e.summaryKo || "요약(한글) 미입력"}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        className="rounded-2xl"
                        onClick={() => {
                          setActiveId(e.id);
                          setEditorOpen(true);
                        }}
                      >
                        열기
                      </Button>
                      <Button
                        variant="destructive"
                        className="rounded-2xl"
                        onClick={() => removeEntry(e.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filtered.length === 0 && (
                <div className="text-sm text-muted-foreground">검색 결과가 없어요.</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="vocab" className="space-y-4">
            <Card className="rounded-2xl shadow-sm">
              <CardContent className="p-4 md:p-6">
                <div className="flex items-center justify-between gap-2 flex-col md:flex-row">
                  <div>
                    <div className="font-semibold">누적 단어장</div>
                    <div className="text-sm text-muted-foreground mt-1">모든 기록의 단어를 모아서 보여줘요.</div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {(() => {
                    const all = Array.from(
                      new Set(entries.flatMap((e) => e.vocab || []).map((v) => v.trim()).filter(Boolean))
                    ).sort((a, b) => a.localeCompare(b));
                    if (all.length === 0) {
                      return <div className="text-sm text-muted-foreground">아직 단어가 없어요.</div>;
                    }
                    return all.map((v) => (
                      <Badge key={v} variant="secondary" className="rounded-2xl px-3 py-1">
                        {v}
                      </Badge>
                    ));
                  })()}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm">
              <CardContent className="p-4 md:p-6">
                <div className="font-semibold">Anki용 내보내기(간단)</div>
                <div className="text-sm text-muted-foreground mt-1">
                  현재는 "단어"만 내보내요. (의미/예문까지 자동 생성은 다음 단계)
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    className="rounded-2xl"
                    onClick={async () => {
                      const all = Array.from(
                        new Set(entries.flatMap((e) => e.vocab || []).map((v) => v.trim()).filter(Boolean))
                      );
                      const csv = all.map((v) => `${v}\t`).join("\n");
                      await navigator.clipboard.writeText(csv);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1200);
                    }}
                  >
                    {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                    탭(\t) 포맷 복사
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="how" className="space-y-4">
            <Card className="rounded-2xl shadow-sm">
              <CardContent className="p-4 md:p-6 space-y-3">
                <div className="font-semibold">1) 왜 "발췌"로 하냐</div>
                <div className="text-sm text-muted-foreground">
                  BBC 기사 전체를 그대로 붙여넣는 건 길이도 길고, 저작권/복제 이슈도 생길 수 있어요. 그래서
                  "핵심 문장 10~20문장"만 발췌해 학습하는 방식이 효율적입니다.
                </div>
                <div className="font-semibold mt-2">2) 추천 루틴 (15~35분)</div>
                <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                  <li>발췌 10~20문장 붙여넣기 (3분)</li>
                  <li>내 번역 작성 (7~15분)</li>
                  <li>프롬프트 복사 → GPT 교정/번역 (3분)</li>
                  <li>요약 2+2문장 저장 + 단어 5~10개 적립 (5~10분)</li>
                </ul>
                <div className="font-semibold mt-2">3) 다음 단계(원하면)</div>
                <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                  <li>BBC RSS로 기사 목록 자동 불러오기(요약/제목만)</li>
                  <li>주간 리포트(읽은 분야 분포, 난이도, 누적 단어) 자동 생성</li>
                  <li>단어별 의미/예문을 GPT로 생성해 Anki 카드까지 자동화</li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
          <DialogContent className="max-w-4xl rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between gap-3">
                <div className="min-w-0 truncate">기록 편집</div>
                <div className="flex gap-2">
                  <Button variant="secondary" className="rounded-2xl" onClick={copyPrompt}>
                    {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                    GPT 프롬프트 복사
                  </Button>
                  {active && (
                    <Button
                      variant="destructive"
                      className="rounded-2xl"
                      onClick={() => removeEntry(active.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </DialogTitle>
            </DialogHeader>

            {!active ? (
              <div className="text-sm text-muted-foreground">선택된 기록이 없어요.</div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Date</div>
                    <Input value={active.date || ""} onChange={(e) => updateActive({ date: e.target.value })} />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Topic</div>
                    <select
                      className="h-10 w-full rounded-2xl border bg-background px-3 text-sm"
                      value={active.topic || "Other"}
                      onChange={(e) => updateActive({ topic: e.target.value })}
                    >
                      {topicOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Minutes</div>
                    <Input
                      type="number"
                      value={active.minutes ?? 0}
                      onChange={(e) => updateActive({ minutes: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Title</div>
                    <Input value={active.title || ""} onChange={(e) => updateActive({ title: e.target.value })} />
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">URL</div>
                    <Input value={active.url || ""} onChange={(e) => updateActive({ url: e.target.value })} />
                  </div>
                </div>

                <Card className="rounded-2xl">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">원문 발췌</div>
                      <div className="text-sm text-muted-foreground">
                        {wordCount(active.excerpt)} words
                      </div>
                    </div>
                    <Textarea
                      placeholder="BBC 기사에서 학습할 문장 10~20문장 정도만 발췌해서 붙여넣기"
                      value={active.excerpt || ""}
                      onChange={(e) => updateActive({ excerpt: e.target.value })}
                      className="min-h-[140px]"
                    />
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Card className="rounded-2xl">
                    <CardContent className="p-4 space-y-2">
                      <div className="font-semibold">내 번역</div>
                      <Textarea
                        placeholder="직접 번역. 모르는 부분은 빈칸/???로 남겨도 OK"
                        value={active.myTranslation || ""}
                        onChange={(e) => updateActive({ myTranslation: e.target.value })}
                        className="min-h-[160px]"
                      />
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl">
                    <CardContent className="p-4 space-y-2">
                      <div className="font-semibold">GPT 결과(붙여넣기)</div>
                      <Textarea
                        placeholder="ChatGPT가 준 교정/번역/표현/요약 결과를 여기에 저장"
                        value={active.gptResult || ""}
                        onChange={(e) => updateActive({ gptResult: e.target.value })}
                        className="min-h-[160px]"
                      />
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Card className="rounded-2xl">
                    <CardContent className="p-4 space-y-2">
                      <div className="font-semibold">요약 (EN 2문장)</div>
                      <Textarea
                        value={active.summaryEn || ""}
                        onChange={(e) => updateActive({ summaryEn: e.target.value })}
                        className="min-h-[96px]"
                      />
                    </CardContent>
                  </Card>
                  <Card className="rounded-2xl">
                    <CardContent className="p-4 space-y-2">
                      <div className="font-semibold">요약 (KO 2문장)</div>
                      <Textarea
                        value={active.summaryKo || ""}
                        onChange={(e) => updateActive({ summaryKo: e.target.value })}
                        className="min-h-[96px]"
                      />
                    </CardContent>
                  </Card>
                </div>

                <Card className="rounded-2xl">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">단어/표현</div>
                      <div className="text-sm text-muted-foreground">{(active.vocab || []).length}개</div>
                    </div>
                    <VocabPanel />
                  </CardContent>
                </Card>

                <Card className="rounded-2xl">
                  <CardContent className="p-4 space-y-2">
                    <div className="font-semibold">메모</div>
                    <Textarea
                      placeholder="오늘 헷갈린 문법/실수 유형/다음에 볼 포인트"
                      value={active.notes || ""}
                      onChange={(e) => updateActive({ notes: e.target.value })}
                      className="min-h-[96px]"
                    />
                  </CardContent>
                </Card>

                <div className="flex items-center justify-end gap-2">
                  <Button variant="secondary" className="rounded-2xl" onClick={() => setEditorOpen(false)}>
                    닫기
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <footer className="text-xs text-muted-foreground py-4">
          로컬 저장(localStorage) 기반 MVP · 원하는 기능(자동 기사 목록, 주간 리포트, Anki 자동화) 말하면 확장 가능
        </footer>
      </div>
    </div>
  );
}
