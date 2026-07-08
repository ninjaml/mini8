import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Mic, AudioLines, Loader2, Sparkles } from "lucide-react";
import { Tooltip } from "../common/Tooltip";
import { getSpeechToken, recognizeSpeech } from '../../lib/speech';
import { listApiKeys } from '../../lib/env';
import { runtime } from '../../lib/runtime';
import { api } from '../../lib/api';
import { applyWorkspaceMention, extractTrailingWorkspaceMention, resolveWorkspaceMessageTarget } from "../../features/workspace/workspaceMessageTarget";

export function BottomConsole({
  disabled = false,
  draft,
  onChangeDraft,
  onChangeTarget,
  onSubmit,
  onStop,
  isStreaming = false,
  options = [],
  mentionOptions = [],
  placeholder,
  selectedTarget,
  targetLabel,
  isMultimodal = false,
  dropUploadContext = null,
  skillContext = null,
  requireLeadingMention = false,
  isSubmitting = false,
  submittingLabel = "执行中",
  workspaceTargetOptions = [],
  workspaceTargetSelected = "",
  workspaceTargetFlash = false,
  onChangeWorkspaceTarget = null,
}) {
  const [inputHeight, setInputHeight] = useState(100);
  const [attachments, setAttachments] = useState([]);
  const [droppedFileRefs, setDroppedFileRefs] = useState([]);
  const [skills, setSkills] = useState([]);
  const [skillPanelOpen, setSkillPanelOpen] = useState(false);
  const [skillPanelIndex, setSkillPanelIndex] = useState(0);
  const [skillPanelLoading, setSkillPanelLoading] = useState(false);
  const [skillPanelPos, setSkillPanelPos] = useState(null);
  const [mentionPanelOpen, setMentionPanelOpen] = useState(false);
  const [mentionPanelRequested, setMentionPanelRequested] = useState(false);
  const [mentionPanelIndex, setMentionPanelIndex] = useState(0);
  const [mentionPanelPos, setMentionPanelPos] = useState(null);
  const resizeRef = useRef(null);
  const fileInputRef = useRef(null);
  const skillPanelRef = useRef(null);
  const mentionPanelRef = useRef(null);
  const trimmedDraft = String(draft || "").trim();
  const hasDraft = Boolean(trimmedDraft) || droppedFileRefs.length > 0;
  const showStopButton = isStreaming && !Boolean(draft?.trim());
  const normalizedMentionOptions = mentionOptions.map((option) => ({
    name: option.name || option.label || "",
    sessionId: option.sessionId || option.value || "",
  }));
  const leadingMentionTarget = requireLeadingMention
    ? resolveWorkspaceMessageTarget(draft, normalizedMentionOptions, "")
    : null;
  const leadingMentionReady = !requireLeadingMention
    || (Boolean(leadingMentionTarget?.mentionName) && Boolean(leadingMentionTarget?.sessionId));
  const actionDisabled = showStopButton
    ? disabled || !onStop
    : disabled || isSubmitting || !hasDraft || !leadingMentionReady;

  const [isRecording, setIsRecording] = useState(false);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [toast, setToast] = useState(null);
  const [speechEnabled, setSpeechEnabled] = useState(false);

  const showToast = (message, type = 'error') => {
    if (!mountedRef.current) return;
    setToast({ message, type });
    window.setTimeout(() => {
      if (mountedRef.current) setToast(null);
    }, 3000);
  };
  const recordingTimerRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const streamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingStartTimeRef = useRef(0);
  const sampleRateRef = useRef(16000);
  const isRecordingRef = useRef(false);
  const isComposingRef = useRef(false);
  const draftRef = useRef(draft);
  const mountedRef = useRef(true);
  const textareaRef = useRef(null);
  const dragCounterRef = useRef(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => { draftRef.current = draft; }, [draft]);

  // --- Drag & Drop file path upload ---
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dropUploadContext) return;
    dragCounterRef.current += 1;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dropUploadContext) return;
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);

    if (!dropUploadContext) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    console.info("[BottomConsole] drop", {
      fileCount: files.length,
      dropUploadContext,
    });

    setIsUploading(true);

    // 1. 所有文件先上传到 working_dir
    const results = await Promise.allSettled(
      files.map(file =>
        runtime.uploadFile({
          file,
          kind: dropUploadContext.kind,
          agentSessionId: dropUploadContext.agentSessionId,
          primaryKey: dropUploadContext.primaryKey,
        }).then(result => ({ file, result }))
      )
    );

    const newRefs = [];
    const newAttachments = [];
    const errors = [];

    results.forEach((res) => {
      if (res.status === 'fulfilled') {
        const { file, result } = res.value;
        if (!result?.path) return;

        const isImage = file.type.startsWith('image/');

        if (isImage && isMultimodal) {
          // 多模态模型 + 图片 → 走 attachments（LLM 直接看图）
          newAttachments.push({
            id: `${file.name}-${Date.now()}-${Math.random()}`,
            file,
            name: file.name,
            size: file.size,
            type: file.type,
            preview: URL.createObjectURL(file),
          });
        } else {
          // 其他所有情况 → 走 droppedFileRefs（路径引用）
          newRefs.push({
            path: result.path,
            name: file.name || '文件',
          });
        }
      } else {
        console.error('[BottomConsole] Upload failed:', res.reason);
        errors.push(res.reason?.message || '上传失败');
      }
    });

    if (newAttachments.length > 0) {
      setAttachments(prev => [...prev, ...newAttachments]);
    }

    if (newRefs.length > 0) {
      setDroppedFileRefs(prev => [...prev, ...newRefs]);
      // 第一次有文件走引用路径时提示
      const hasShownTip = sessionStorage.getItem('camphor_file_drop_tip');
      if (!hasShownTip) {
        showToast('建议拖拽文本文件，方便 Agent 理解', 'info');
        sessionStorage.setItem('camphor_file_drop_tip', '1');
      }
    }

    if (errors.length > 0) {
      showToast(errors.join('；'), 'error');
    }

    setIsUploading(false);
  };

  const removeDroppedFileRef = (path) => {
    setDroppedFileRefs(prev => prev.filter(ref => ref.path !== path));
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function checkSpeechKeys() {
      try {
        const keysData = await listApiKeys();
        const keys = keysData.keys || [];
        const baiduApi = keys.find((k) => k.provider === 'baidu_api');
        const baiduSecret = keys.find((k) => k.provider === 'baidu_secret');
        if (!cancelled) {
          setSpeechEnabled(!!baiduApi?.has_value && !!baiduSecret?.has_value);
        }
      } catch (error) {
        if (!cancelled) {
          setSpeechEnabled(false);
        }
      }
    }
    checkSpeechKeys();
    return () => { cancelled = true; };
  }, []);

  // Load height from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('chatInputHeight');
    if (saved) {
      const height = parseInt(saved, 10);
      if (!isNaN(height) && height >= 60 && height <= 400) {
        setInputHeight(height);
      }
    }
  }, []);

  // Save height to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('chatInputHeight', inputHeight.toString());
  }, [inputHeight]);

  const handleMouseDown = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = inputHeight;

    const handleMouseMove = (e) => {
      const deltaY = startY - e.clientY; // inverted: drag up = taller
      const newHeight = Math.max(60, Math.min(400, startHeight + deltaY));
      setInputHeight(newHeight);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleKeyboardResize = (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setInputHeight(prev => Math.min(400, prev + 10));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setInputHeight(prev => Math.max(60, prev - 10));
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    console.log('[BottomConsole] Files selected:', files.length);

    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    const ALLOWED_MIME_TYPES = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
      'application/pdf', 'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    const validFiles = [];
    const errors = [];

    files.forEach(file => {
      console.log('[BottomConsole] Processing file:', file.name, 'type:', file.type, 'size:', file.size);

      if (file.size === 0) {
        errors.push(`${file.name} 是空文件`);
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name} 超过 10MB 限制`);
        return;
      }

      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        errors.push(`${file.name} 文件类型不支持`);
        return;
      }

      const fileObj = {
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        name: file.name,
        size: file.size,
        type: file.type,
      };

      // Create preview for images
      if (file.type.startsWith('image/')) {
        fileObj.preview = URL.createObjectURL(file);
        console.log('[BottomConsole] Created preview URL for image:', fileObj.preview);
      }

      validFiles.push(fileObj);
    });

    if (errors.length > 0) {
      showToast(errors.join('；'), 'error');
    }

    console.log('[BottomConsole] Valid files:', validFiles.length);
    setAttachments(prev => {
      const newAttachments = [...prev, ...validFiles];
      console.log('[BottomConsole] Updated attachments:', newAttachments);
      return newAttachments;
    });

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (id) => {
    setAttachments(prev => {
      const removed = prev.find(att => att.id === id);
      if (removed && removed.preview) {
        URL.revokeObjectURL(removed.preview);
      }
      return prev.filter(att => att.id !== id);
    });
  };

  const handleSubmitWithAttachments = () => {
    if (!hasDraft) return;
    if (requireLeadingMention && !leadingMentionReady) {
      showToast('请先在开头 @ 一个工作成员', 'error');
      return;
    }

    let finalText = draftRef.current || '';

    // 如果有文件引用，拼接到消息末尾
    if (droppedFileRefs.length > 0) {
      const paths = droppedFileRefs.map(ref => `"${ref.path}"`).join('\n');
      const separator = finalText.trim().length > 0 ? '\n\n' : '';
      finalText = finalText.trim() + separator + `请你参考如下文件：\n${paths}`;
      setDroppedFileRefs([]);
    }

    if (onSubmit) {
      onSubmit(attachments, finalText);
      // Clear attachments after sending
      attachments.forEach(att => {
        if (att.preview) {
          URL.revokeObjectURL(att.preview);
        }
      });
      setAttachments([]);
    }
  };

  // Cleanup previews on unmount
  useEffect(() => {
    return () => {
      attachments.forEach(att => {
        if (att.preview) {
          URL.revokeObjectURL(att.preview);
        }
      });
    };
  }, [attachments]);

  // Visibility change: stop recording when tab hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isRecording) {
        stopRecording();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearTimeout(recordingTimerRef.current);
      }
      if (processorRef.current) {
        processorRef.current.onaudioprocess = null;
        processorRef.current.disconnect();
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  async function startRecording() {
    if (isRecordingRef.current) return;
    isRecordingRef.current = true;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast('当前浏览器不支持语音输入', 'error');
      isRecordingRef.current = false;
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1 }
      });
      streamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      const actualRate = audioContext.sampleRate;
      sampleRateRef.current = actualRate;

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      source.connect(processor);

      const zeroGain = audioContext.createGain();
      zeroGain.gain.value = 0;
      processor.connect(zeroGain);
      zeroGain.connect(audioContext.destination);

      audioChunksRef.current = [];
      processor.onaudioprocess = (e) => {
        audioChunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };

      recordingStartTimeRef.current = Date.now();
      setIsRecording(true);

      recordingTimerRef.current = window.setTimeout(() => {
        stopRecording();
      }, 55000);

    } catch (error) {
      console.error('Failed to start recording:', error);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      isRecordingRef.current = false;
      if (error.name === 'NotAllowedError') {
        showToast('需要麦克风权限才能使用语音输入', 'error');
      } else {
        showToast('无法启动录音：' + error.message, 'error');
      }
    }
  }

  async function stopRecording() {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;

    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    const duration = Date.now() - recordingStartTimeRef.current;

    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setIsRecording(false);

    if (duration < 500) {
      audioChunksRef.current = [];
      return;
    }

    const chunks = audioChunksRef.current;
    if (chunks.length === 0) return;

    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    const actualRate = sampleRateRef.current;
    const targetRate = 16000;
    let resampled = merged;
    if (actualRate !== targetRate) {
      const ratio = actualRate / targetRate;
      const newLength = Math.floor(merged.length / ratio);
      resampled = new Float32Array(newLength);
      for (let i = 0; i < newLength; i++) {
        // NOTE: nearest-neighbor downsampling; replace with linear interpolation if quality issues
        const srcIndex = Math.floor(i * ratio);
        resampled[i] = merged[srcIndex];
      }
    }

    const int16Data = new Int16Array(resampled.length);
    for (let i = 0; i < resampled.length; i++) {
      const s = Math.max(-1, Math.min(1, resampled[i]));
      int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    const uint8Array = new Uint8Array(int16Data.buffer);
    let binary = '';
    const len = uint8Array.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const audioBase64 = btoa(binary);

    setIsRecognizing(true);
    try {
      const tokenData = await getSpeechToken();
      const result = await recognizeSpeech({
        token: tokenData.access_token,
        audioBase64,
        format: 'pcm',
        rate: 16000,
        len: int16Data.length * 2,
      });

      const recognizedText = result.result?.[0];
      if (recognizedText) {
        const currentDraft = draftRef.current || '';
        const separator = currentDraft.length > 0 && !currentDraft.endsWith(' ') ? ' ' : '';
        onChangeDraft?.(currentDraft + separator + recognizedText);
      } else {
        showToast('未能识别到语音，请重试', 'error');
      }
    } catch (error) {
      console.error('Speech recognition failed:', error);
      showToast('语音识别失败：' + (error.message || '未知错误'), 'error');
    } finally {
      setIsRecognizing(false);
      audioChunksRef.current = [];
    }
  }

  // --- Skill slash panel logic ---
  // 匹配行尾最近的 /xxx，且 / 前面是开头、空格或换行
  const slashMatch = (draft || '').match(/(^|\s)\/([^ ]*)$/);
  const skillQuery = slashMatch ? slashMatch[2] : '';
  const shouldShowSkillPanel = skillContext != null && slashMatch !== null;
  const mentionMatch = extractTrailingWorkspaceMention(draft);
  const mentionQuery = mentionMatch ? mentionMatch.query : '';
  const shouldShowMentionPanel =
    mentionOptions.length > 0 && (mentionMatch !== null || (requireLeadingMention && mentionPanelRequested));

  useEffect(() => {
    if (!shouldShowSkillPanel) {
      setSkillPanelOpen(false);
      setSkills([]);
      return;
    }
    let cancelled = false;
    async function loadSkills() {
      setSkillPanelLoading(true);
      try {
        const data = await api.getAgentSkills(skillContext);
        if (!cancelled) {
          setSkills(data.skills || []);
          setSkillPanelIndex(0);
          setSkillPanelOpen(true);
        }
      } catch (err) {
        console.error('[BottomConsole] Failed to load skills:', err);
        if (!cancelled) {
          setSkills([]);
          setSkillPanelOpen(false);
        }
      } finally {
        if (!cancelled) setSkillPanelLoading(false);
      }
    }
    loadSkills();
    return () => { cancelled = true; };
  }, [shouldShowSkillPanel, skillContext?.kind, skillContext?.id, skillContext?.agentSessionId, skillContext?.primaryKey]);

  useEffect(() => {
    if (!shouldShowMentionPanel) {
      setMentionPanelOpen(false);
      return;
    }
    setMentionPanelOpen(true);
    setMentionPanelIndex(0);
  }, [shouldShowMentionPanel, mentionOptions]);

  const filteredSkills = skillQuery
    ? skills.filter((s) =>
        s.name.toLowerCase().includes(skillQuery.toLowerCase()) ||
        s.description.toLowerCase().includes(skillQuery.toLowerCase())
      )
    : skills;
  const filteredMentions = mentionQuery
    ? mentionOptions.filter((option) => option.label.toLowerCase().includes(mentionQuery.toLowerCase()) || option.value.toLowerCase().includes(mentionQuery.toLowerCase()))
    : mentionOptions;

  function insertSkill(skillName) {
    const current = draftRef.current || draft || '';
    const lastSlashIndex = current.lastIndexOf('/');
    if (lastSlashIndex === -1) {
      onChangeDraft?.(`使用 "${skillName}" 技能 `);
    } else {
      const prefix = current.slice(0, lastSlashIndex);
      const separator = prefix.length > 0 && !/[\s\n]$/.test(prefix) ? ' ' : '';
      onChangeDraft?.(prefix + separator + `使用 "${skillName}" 技能 `);
    }
    setSkillPanelOpen(false);
    setSkillPanelIndex(0);
    textareaRef.current?.focus();
  }

  function insertMention(agentOption) {
    const current = draftRef.current || draft || '';
    const nextDraft = applyWorkspaceMention(current, agentOption.label);
    onChangeDraft?.(nextDraft);
    onChangeTarget?.(agentOption.value);
    setMentionPanelOpen(false);
    setMentionPanelRequested(false);
    setMentionPanelIndex(0);
    textareaRef.current?.focus();
  }

  function handleSkillKeyDown(event) {
    if (!skillPanelOpen || filteredSkills.length === 0) return;
    const isImeComposing =
      event.nativeEvent?.isComposing || isComposingRef.current || event.keyCode === 229;
    if (isImeComposing) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSkillPanelIndex((prev) => (prev + 1) % filteredSkills.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSkillPanelIndex((prev) => (prev - 1 + filteredSkills.length) % filteredSkills.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      insertSkill(filteredSkills[skillPanelIndex].name);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setSkillPanelOpen(false);
    }
  }

  function handleMentionKeyDown(event) {
    if (!mentionPanelOpen || filteredMentions.length === 0) return;
    const isImeComposing =
      event.nativeEvent?.isComposing || isComposingRef.current || event.keyCode === 229;
    if (isImeComposing) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setMentionPanelIndex((prev) => (prev + 1) % filteredMentions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setMentionPanelIndex((prev) => (prev - 1 + filteredMentions.length) % filteredMentions.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      insertMention(filteredMentions[mentionPanelIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setMentionPanelOpen(false);
    }
  }

  useEffect(() => {
    function handleClickOutside(e) {
      if (skillPanelRef.current && !skillPanelRef.current.contains(e.target)) {
        setSkillPanelOpen(false);
      }
      if (mentionPanelRef.current && !mentionPanelRef.current.contains(e.target)) {
        setMentionPanelOpen(false);
      }
    }
    if (skillPanelOpen || mentionPanelOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [skillPanelOpen, mentionPanelOpen]);

  useEffect(() => {
    if (skillPanelOpen && textareaRef.current) {
      const rect = textareaRef.current.getBoundingClientRect();
      setSkillPanelPos({
        position: 'fixed',
        bottom: `${window.innerHeight - rect.top + 8}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        zIndex: 9999,
      });
    } else {
      setSkillPanelPos(null);
    }
  }, [skillPanelOpen, inputHeight]);

  useEffect(() => {
    if (mentionPanelOpen && textareaRef.current) {
      const rect = textareaRef.current.getBoundingClientRect();
      setMentionPanelPos({
        position: 'fixed',
        bottom: `${window.innerHeight - rect.top + 6}px`,
        left: `${rect.left}px`,
        width: `${Math.min(rect.width, 280)}px`,
        zIndex: 10001,
      });
    } else {
      setMentionPanelPos(null);
    }
  }, [mentionPanelOpen, inputHeight]);

  useEffect(() => {
    if (!skillPanelOpen || filteredSkills.length === 0) return;
    const items = skillPanelRef.current?.querySelectorAll('.skill-panel-item');
    const activeItem = items?.[skillPanelIndex];
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [skillPanelIndex, skillPanelOpen, filteredSkills.length]);

  useEffect(() => {
    if (!mentionPanelOpen || filteredMentions.length === 0) return;
    const items = mentionPanelRef.current?.querySelectorAll('.mention-panel-item');
    const activeItem = items?.[mentionPanelIndex];
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [mentionPanelIndex, mentionPanelOpen, filteredMentions.length]);

  return (
    <footer className="app-footer">
      <div
        className={`console-wrapper${isDragOver ? ' drag-over' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {toast && (
          <div
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 8px)',
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '10px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              zIndex: 100,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              backgroundColor: toast.type === 'error' ? '#fee2e2' : '#eff6ff',
              color: toast.type === 'error' ? '#991b1b' : '#1e40af',
              border: `1px solid ${toast.type === 'error' ? '#fecaca' : '#bfdbfe'}`,
              animation: 'fadeInUp 0.2s ease',
            }}
          >
            {toast.message}
          </div>
        )}
        <div className="input-box-content">
          <div
            className="chat-input-resize-handle"
            onMouseDown={handleMouseDown}
            onKeyDown={handleKeyboardResize}
            ref={resizeRef}
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize input height"
            tabIndex={0}
          >
            <div className="resize-handle-bar"></div>
          </div>
          {workspaceTargetOptions.length > 0 ? (
            <div className={`workspace-target-row ${workspaceTargetFlash ? "is-flashing" : ""}`}>
              <div className="workspace-target-row__chips">
                {workspaceTargetOptions.map((option) => {
                  const isSelected = String(option.sessionId) === String(workspaceTargetSelected);
                  return (
                    <button
                      key={option.sessionId}
                      type="button"
                      className={`workspace-target-row__chip ${isSelected ? "is-selected" : ""}`}
                      onClick={() => onChangeWorkspaceTarget?.(option.sessionId)}
                    >
                      {option.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="input-area">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              multiple
              style={{ display: 'none' }}
              accept="image/*,.pdf,.doc,.docx,.txt"
              aria-label="选择文件"
            />
            <div className="textarea-wrapper">
              <textarea
                ref={textareaRef}
                disabled={disabled || isUploading}
                rows="1"
                placeholder={isUploading ? '上传中...' : placeholder}
                value={draft}
                onChange={(event) => onChangeDraft?.(event.target.value)}
                onFocus={() => {
                  if (requireLeadingMention && mentionOptions.length > 0) {
                    setMentionPanelRequested(true);
                  }
                }}
                onCompositionStart={() => {
                  isComposingRef.current = true;
                }}
                onCompositionEnd={() => {
                  isComposingRef.current = false;
                }}
                onKeyDown={(event) => {
                  const isImeComposing =
                    event.nativeEvent?.isComposing || isComposingRef.current || event.keyCode === 229;
                  if (isImeComposing) {
                    return;
                  }
                  if (mentionPanelOpen && filteredMentions.length > 0) {
                    handleMentionKeyDown(event);
                    return;
                  }
                  if (skillPanelOpen && filteredSkills.length > 0) {
                    handleSkillKeyDown(event);
                    return;
                  }
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    handleSubmitWithAttachments();
                  }
                }}
                style={{ height: `${inputHeight}px` }}
                className="chat-input-textarea"
              />
              <div className="input-actions">
                {isMultimodal && (
                  <Tooltip text="添加附件">
                    <button
                      className="attachment-btn"
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={disabled}
                      aria-label="添加附件"
                    >
                      📎
                    </button>
                  </Tooltip>
                )}
                {!isRecording && !isRecognizing && (
                  <Tooltip text={speechEnabled ? "语音输入" : "请先配置百度语音 API Key"} direction="up">
                    <button
                      className="mic-btn"
                      type="button"
                      onClick={startRecording}
                      disabled={disabled || !speechEnabled}
                      aria-label={speechEnabled ? "语音输入" : "请先配置百度语音 API Key"}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        background: speechEnabled ? 'rgba(16, 185, 129, 0.1)' : 'rgba(0, 0, 0, 0.04)',
                        border: `1px solid ${speechEnabled ? 'rgba(16, 185, 129, 0.3)' : 'rgba(0, 0, 0, 0.08)'}`,
                        color: speechEnabled ? '#10b981' : '#9ca3af',
                        fontSize: '16px',
                        cursor: speechEnabled ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                        flexShrink: 0,
                        opacity: speechEnabled ? 1 : 0.5,
                      }}
                    >
                      <Mic size={18} strokeWidth={2} />
                    </button>
                  </Tooltip>
                )}
                {isRecording && (
                  <Tooltip text="停止录音" direction="up">
                    <button
                      className="mic-btn recording"
                      type="button"
                      onClick={stopRecording}
                      aria-label="停止录音"
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        background: '#f59e0b',
                        border: '1px solid #f59e0b',
                        color: 'white',
                        fontSize: '16px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                        flexShrink: 0,
                      }}
                    >
                      <AudioLines size={18} strokeWidth={2} color="white" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
                    </button>
                  </Tooltip>
                )}
                {isRecognizing && (
                  <Tooltip text="语音识别中..." direction="up">
                    <button
                      className="mic-btn recognizing"
                      type="button"
                      disabled
                      aria-label="语音识别中"
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        background: 'rgba(0, 0, 0, 0.06)',
                        border: '1px solid rgba(0, 0, 0, 0.1)',
                        color: '#6b7280',
                        fontSize: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        cursor: 'default',
                        userSelect: 'none',
                      }}
                    >
                      <Loader2 size={18} strokeWidth={2} style={{ animation: 'spin 1s linear infinite' }} />
                    </button>
                  </Tooltip>
                )}
                <Tooltip text={showStopButton ? "停止回复" : isSubmitting ? submittingLabel : isStreaming ? "发送到队列" : "发送"} direction="up">
                  <button
                    className={`send-btn ${showStopButton ? 'stop-btn' : ''}`}
                    disabled={actionDisabled}
                    type="button"
                    aria-label={showStopButton ? "停止回复" : isSubmitting ? submittingLabel : isStreaming ? "发送到队列" : "发送"}
                    onClick={showStopButton ? onStop : handleSubmitWithAttachments}
                  >
                    {showStopButton ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="6" width="12" height="12" rx="2"></rect>
                      </svg>
                    ) : isSubmitting ? (
                      <Loader2 size={16} strokeWidth={2.2} style={{ animation: 'spin 1s linear infinite' }} />
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z"></path>
                      </svg>
                    )}
                  </button>
                </Tooltip>
              </div>
            </div>
          </div>
          {droppedFileRefs.length > 0 && (
            <div className="file-ref-area">
              <span className="file-ref-label">引用文件</span>
              {droppedFileRefs.map((ref) => (
                <div key={ref.path} className="file-ref-tag" title={ref.path}>
                  <span className="file-ref-name">{ref.name}</span>
                  <button
                    className="file-ref-remove"
                    type="button"
                    onClick={() => removeDroppedFileRef(ref.path)}
                    aria-label={`移除 ${ref.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {skillPanelOpen && skillContext && skillPanelPos && (
            <div className="skill-panel" ref={skillPanelRef} style={skillPanelPos}>
              {skillPanelLoading ? (
                <div className="skill-panel-loading">
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  <span>加载 skills...</span>
                </div>
              ) : filteredSkills.length === 0 ? (
                <div className="skill-panel-empty">没有匹配的 skill</div>
              ) : (
                <ul className="skill-panel-list">
                  {filteredSkills.map((skill, index) => (
                    <li
                      key={skill.name}
                      className={`skill-panel-item ${index === skillPanelIndex ? 'active' : ''}`}
                      onClick={() => insertSkill(skill.name)}
                      onMouseEnter={() => setSkillPanelIndex(index)}
                    >
                      <Sparkles size={14} className="skill-panel-icon" />
                      <div className="skill-panel-info">
                        <span className="skill-panel-name">{skill.name}</span>
                        <span className="skill-panel-desc">{skill.description}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {attachments.length > 0 && (
            <div className="attachment-preview-area">
              {console.log('[BottomConsole] Rendering attachments:', attachments)}
              {attachments.map(att => (
                <div key={att.id} className="attachment-preview-item">
                  {att.preview ? (
                    <img src={att.preview} alt={att.name} className="attachment-preview-thumb" />
                  ) : (
                    <div className="attachment-file-icon">📄</div>
                  )}
                  <div className="attachment-info">
                    <span className="attachment-name" title={att.name}>{att.name}</span>
                    <span className="attachment-size">{(att.size / 1024).toFixed(1)} KB</span>
                  </div>
                  <Tooltip text="移除附件">
                    <button
                      className="attachment-remove-btn"
                      onClick={() => removeAttachment(att.id)}
                      type="button"
                      aria-label={`移除 ${att.name}`}
                    >
                      ×
                    </button>
                  </Tooltip>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {mentionPanelOpen && mentionPanelPos && typeof document !== 'undefined'
        ? createPortal(
            <div className="mention-panel" ref={mentionPanelRef} style={mentionPanelPos}>
              {filteredMentions.length === 0 ? (
                <div className="mention-panel-empty">没有可选的工作成员</div>
              ) : (
                <ul className="mention-panel-list">
                  {filteredMentions.map((option, index) => (
                    <li
                      key={option.value}
                      className={`mention-panel-item ${index === mentionPanelIndex ? 'active' : ''}`}
                      onClick={() => insertMention(option)}
                      onMouseEnter={() => setMentionPanelIndex(index)}
                        >
                          <Sparkles size={14} className="mention-panel-icon" />
                          <div className="mention-panel-info">
                            <span className="mention-panel-name">{option.label}</span>
                          </div>
                        </li>
                      ))}
                </ul>
              )}
            </div>,
            document.body,
          )
        : null}
    </footer>
  );
}
