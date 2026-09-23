"use client";

import React, { useState } from "react";
import { ExamPostItem } from "@/services/exam-onboarding/exam-onboarding.service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, PlusCircle, Trash2, Edit2, ShieldAlert } from "lucide-react";

interface Props {
  examId: string;
  initialPosts: ExamPostItem[];
  onSavePost: (post: ExamPostItem) => Promise<void>;
  onDeletePost: (postId: string) => Promise<void>;
  onContinue: () => void;
  onBack: () => void;
  isSaving: boolean;
}

export function Step3Posts({ examId, initialPosts, onSavePost, onDeletePost, onContinue, onBack, isSaving }: Props) {
  const [posts, setPosts] = useState<ExamPostItem[]>(initialPosts);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<ExamPostItem | null>(null);

  // Form states
  const [postName, setPostName] = useState("");
  const [postCode, setPostCode] = useState("");
  const [department, setDepartment] = useState("");
  const [ministry, setMinistry] = useState("");
  const [classificationGroup, setClassificationGroup] = useState("Group B");
  const [isGazetted, setIsGazetted] = useState(false);
  const [payLevel, setPayLevel] = useState<number>(7);
  const [modalError, setModalError] = useState<string | null>(null);

  const openNewPost = () => {
    setEditingPost(null);
    setPostName("");
    setPostCode("");
    setDepartment("");
    setMinistry("");
    setClassificationGroup("Group B");
    setIsGazetted(false);
    setPayLevel(7);
    setModalError(null);
    setIsModalOpen(true);
  };

  const openEditPost = (p: ExamPostItem) => {
    setEditingPost(p);
    setPostName(p.postName);
    setPostCode(p.postCode || "");
    setDepartment(p.department || "");
    setMinistry(p.ministry || "");
    setClassificationGroup(p.classificationGroup || "Group B");
    setIsGazetted(Boolean(p.isGazetted));
    setPayLevel(p.payLevel || 7);
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleSavePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postName.trim()) {
      setModalError("Post Name is required.");
      return;
    }

    try {
      await onSavePost({
        id: editingPost?.id,
        examId,
        postName: postName.trim(),
        postCode: postCode.trim() || null,
        department: department.trim() || null,
        ministry: ministry.trim() || null,
        classificationGroup,
        isGazetted,
        payLevel,
      });
      setIsModalOpen(false);
    } catch (err: any) {
      setModalError(err.message || "Failed to save post.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" /> Step 3: Recruitment Posts &amp; Eligibility Profiles
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Configure recruitment cadre posts, optional pay scales, and departmental classifications. Examination-agnostic architecture.
          </p>
        </div>
        <Button
          onClick={openNewPost}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-xs"
        >
          <PlusCircle className="w-4 h-4" /> Add Post Profile
        </Button>
      </div>

      {/* Posts Table */}
      <Card className="p-0 bg-white border border-slate-200/80 rounded-2xl shadow-2xs overflow-hidden">
        {posts.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <p className="text-xs font-bold text-slate-600">No post profiles registered yet.</p>
            <p className="text-[11px] text-slate-400">
              Add at least one recruitment post profile or continue to configure syllabus first.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] font-mono">
                <tr>
                  <th className="px-4 py-3">Post Name &amp; Code</th>
                  <th className="px-4 py-3">Department / Ministry</th>
                  <th className="px-4 py-3">Classification</th>
                  <th className="px-4 py-3">Pay Level</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {posts.map((p) => (
                  <tr key={p.id || p.postName} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {p.postName}
                      {p.postCode && (
                        <span className="ml-2 px-1.5 py-0.5 bg-slate-100 text-slate-600 font-mono text-[10px] rounded">
                          {p.postCode}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {p.department || p.ministry || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-[10px]">
                        {p.classificationGroup || "General"}
                        {p.isGazetted && " (Gazetted)"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700">
                      {p.payLevel ? `Level ${p.payLevel}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => openEditPost(p)}
                        className="p-1 hover:text-blue-600 text-slate-400"
                        title="Edit Post"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {p.id && (
                        <button
                          onClick={() => onDeletePost(p.id!)}
                          className="p-1 hover:text-rose-600 text-slate-400"
                          title="Delete Post"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900">
              {editingPost ? "Edit Post Profile" : "Add Recruitment Post"}
            </h3>

            {modalError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSavePost} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Post Title *</label>
                <input
                  type="text"
                  value={postName}
                  onChange={(e) => setPostName(e.target.value)}
                  placeholder="e.g. Probationary Officer or Assistant Section Officer"
                  className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Post Code</label>
                  <input
                    type="text"
                    value={postCode}
                    onChange={(e) => setPostCode(e.target.value)}
                    placeholder="e.g. B01"
                    className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Pay Level (Optional)</label>
                  <input
                    type="number"
                    value={payLevel}
                    onChange={(e) => setPayLevel(parseInt(e.target.value, 10))}
                    min={1}
                    max={18}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Department / Ministry</label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Department of Financial Services"
                  className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  className="text-xs font-bold px-4 py-2 rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-5 py-2 rounded-xl shadow-xs"
                >
                  Save Post
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button
          type="button"
          onClick={onBack}
          variant="outline"
          className="text-xs font-bold px-5 py-2.5 rounded-xl border-slate-200"
        >
          ← Back to Step 2
        </Button>
        <Button
          type="button"
          onClick={onContinue}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-xs"
        >
          Continue to Step 4 →
        </Button>
      </div>
    </div>
  );
}
