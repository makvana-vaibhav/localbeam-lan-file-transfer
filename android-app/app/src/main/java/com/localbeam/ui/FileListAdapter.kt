package com.localbeam.ui

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.localbeam.databinding.ItemFileBinding
import com.localbeam.models.RemoteFile

class FileListAdapter(
    private val onDownload: (RemoteFile) -> Unit,
    private val onDelete: (RemoteFile) -> Unit
) : ListAdapter<RemoteFile, FileListAdapter.FileViewHolder>(FileDiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): FileViewHolder {
        val binding = ItemFileBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return FileViewHolder(binding)
    }

    override fun onBindViewHolder(holder: FileViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    inner class FileViewHolder(private val binding: ItemFileBinding) :
        RecyclerView.ViewHolder(binding.root) {

        fun bind(file: RemoteFile) {
            binding.tvFileName.text = file.originalName
            binding.tvFileSize.text = file.sizeFormatted
            binding.tvFileDate.text = file.modifiedFormatted
            binding.tvFileIcon.text = getFileLabel(file.originalName)

            binding.btnDownload.setOnClickListener { onDownload(file) }
            binding.btnDelete.setOnClickListener { onDelete(file) }
        }

        private fun getFileLabel(name: String): String {
            return when (name.substringAfterLast('.').lowercase()) {
                "jpg", "jpeg", "png", "gif", "webp", "svg" -> "IMG"
                "mp4", "mkv", "avi", "mov", "webm" -> "VID"
                "mp3", "wav", "flac", "aac", "ogg" -> "AUD"
                "pdf" -> "PDF"
                "doc", "docx" -> "DOC"
                "xls", "xlsx" -> "XLS"
                "zip", "rar", "tar", "gz", "7z" -> "ZIP"
                "apk" -> "APK"
                "js", "ts", "py", "java", "kt", "html", "css", "json" -> "CODE"
                else -> "FILE"
            }
        }
    }

    class FileDiffCallback : DiffUtil.ItemCallback<RemoteFile>() {
        override fun areItemsTheSame(oldItem: RemoteFile, newItem: RemoteFile) =
            oldItem.name == newItem.name
        override fun areContentsTheSame(oldItem: RemoteFile, newItem: RemoteFile) =
            oldItem == newItem
    }
}
