package com.localbeam.utils

import android.content.Context
import android.net.Uri
import android.os.Environment
import com.localbeam.api.ApiClient
import com.localbeam.models.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okio.BufferedSink
import okio.source
import java.io.File
import java.io.FileOutputStream

class FileRepository(private val context: Context) {

    private var serverUrl: String = ""

    private val api get() = ApiClient.getApi(serverUrl)

    fun setServerUrl(url: String) {
        serverUrl = url
        PrefsHelper.saveServerUrl(context, url)
    }

    fun getSavedServerUrl(): String {
        return PrefsHelper.getServerUrl(context).also { serverUrl = it }
    }

    suspend fun getServerInfo() = runCatching { api.getServerInfo() }

    suspend fun listFiles() = runCatching { api.listFiles() }

    suspend fun getStats() = runCatching { api.getStats() }

    // Upload with progress tracking
    fun uploadFile(uri: Uri): Flow<UiState<UploadResponse>> = flow {
        emit(UiState.Loading)
        try {
            val inputStream = context.contentResolver.openInputStream(uri)
                ?: throw Exception("Cannot open file")

            val fileName = getFileName(uri)
            val mimeType = context.contentResolver.getType(uri) ?: "application/octet-stream"
            val fileSize = getFileSize(uri)

            var uploadedBytes = 0L
            val startTime = System.currentTimeMillis()

            val requestBody = object : RequestBody() {
                override fun contentType() = mimeType.toMediaTypeOrNull()
                override fun contentLength() = fileSize

                override fun writeTo(sink: BufferedSink) {
                    inputStream.source().use { source ->
                        val buffer = okio.Buffer()
                        var bytesRead: Long
                        while (source.read(buffer, 8192L).also { bytesRead = it } != -1L) {
                            sink.write(buffer, bytesRead)
                            uploadedBytes += bytesRead
                        }
                    }
                }
            }

            val part = MultipartBody.Part.createFormData("files", fileName, requestBody)
            val response = api.uploadFiles(listOf(part))
            emit(UiState.Success(response))
        } catch (e: Exception) {
            emit(UiState.Error(e.message ?: "Upload failed"))
        }
    }.flowOn(Dispatchers.IO)

    // Download file to local storage
    suspend fun downloadFile(remoteFile: RemoteFile): Result<File> = withContext(Dispatchers.IO) {
        runCatching {
            val response = api.downloadFile(remoteFile.name)
            if (!response.isSuccessful) throw Exception("Download failed: ${response.code()}")

            val body = response.body() ?: throw Exception("Empty response body")

            val downloadsDir = Environment.getExternalStoragePublicDirectory(
                Environment.DIRECTORY_DOWNLOADS
            )
            if (!downloadsDir.exists()) downloadsDir.mkdirs()
            
            val localBeamDir = File(downloadsDir, "LocalBeam").apply { mkdirs() }
            
            // Use originalName if available, fallback to parsed filename
            val fileName = if (remoteFile.originalName.isNotEmpty()) {
                remoteFile.originalName
            } else {
                // Parse filename from response headers or use default
                response.headers()["Content-Disposition"]?.let { header ->
                    header.substringAfterLast("filename=").removeSurrounding("\"")
                } ?: remoteFile.name
            }
            
            val destFile = File(localBeamDir, fileName)
            
            // Handle duplicate filenames
            var finalFile = destFile
            var counter = 1
            while (finalFile.exists()) {
                val nameWithoutExt = fileName.substringBeforeLast(".")
                val ext = if (fileName.contains(".")) ".${fileName.substringAfterLast(".")}" else ""
                finalFile = File(localBeamDir, "$nameWithoutExt ($counter)$ext")
                counter++
            }

            FileOutputStream(finalFile).use { output ->
                body.byteStream().use { input ->
                    input.copyTo(output)
                }
            }
            
            finalFile
        }
    }

    suspend fun deleteFile(filename: String) = runCatching {
        api.deleteFile(filename)
    }

    private fun getFileName(uri: Uri): String {
        var name = "file_${System.currentTimeMillis()}"
        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val idx = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
            if (cursor.moveToFirst() && idx >= 0) name = cursor.getString(idx)
        }
        return name
    }

    private fun getFileSize(uri: Uri): Long {
        var size = -1L
        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val idx = cursor.getColumnIndex(android.provider.OpenableColumns.SIZE)
            if (cursor.moveToFirst() && idx >= 0) size = cursor.getLong(idx)
        }
        return size
    }
}
