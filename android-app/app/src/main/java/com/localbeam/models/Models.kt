package com.localbeam.models

import com.google.gson.annotations.SerializedName

data class ServerInfoResponse(
    val ip: String,
    val port: Int,
    val url: String,
    val qr: String?
)

data class RemoteFile(
    val name: String,
    @SerializedName("originalName") val originalName: String,
    val size: Long,
    @SerializedName("sizeFormatted") val sizeFormatted: String,
    val modified: String,
    @SerializedName("modifiedFormatted") val modifiedFormatted: String
)

data class FileListResponse(
    val files: List<RemoteFile>,
    val count: Int
)

data class StatsResponse(
    val fileCount: Int,
    val totalSize: Long,
    @SerializedName("totalSizeFormatted") val totalSizeFormatted: String
)

data class UploadResponse(
    val success: Boolean,
    val files: List<UploadedFile>?
)

data class UploadedFile(
    val name: String,
    val originalName: String,
    val size: Long,
    @SerializedName("sizeFormatted") val sizeFormatted: String
)

// UI State sealed classes
sealed class UiState<out T> {
    object Loading : UiState<Nothing>()
    data class Success<T>(val data: T) : UiState<T>()
    data class Error(val message: String) : UiState<Nothing>()
}

data class TransferProgress(
    val filename: String,
    val bytesTransferred: Long,
    val totalBytes: Long,
    val isUpload: Boolean
) {
    val percentage: Int get() = if (totalBytes > 0) ((bytesTransferred * 100) / totalBytes).toInt() else 0

    fun formattedSpeed(elapsedMs: Long): String {
        if (elapsedMs == 0L) return "—"
        val bytesPerSec = (bytesTransferred * 1000) / elapsedMs
        return formatBytes(bytesPerSec) + "/s"
    }

    companion object {
        fun formatBytes(bytes: Long): String {
            if (bytes < 1024) return "$bytes B"
            val kb = bytes / 1024.0
            if (kb < 1024) return "%.1f KB".format(kb)
            val mb = kb / 1024.0
            if (mb < 1024) return "%.1f MB".format(mb)
            return "%.1f GB".format(mb / 1024.0)
        }
    }
}
