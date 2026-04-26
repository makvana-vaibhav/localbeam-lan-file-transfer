package com.localbeam.ui

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.localbeam.models.*
import com.localbeam.utils.FileRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

class MainViewModel(private val repository: FileRepository) : ViewModel() {

    private val _serverUrl = MutableStateFlow("")
    val serverUrl: StateFlow<String> = _serverUrl.asStateFlow()

    private val _connectionState = MutableStateFlow<UiState<ServerInfoResponse>>(UiState.Loading)
    val connectionState: StateFlow<UiState<ServerInfoResponse>> = _connectionState.asStateFlow()

    private val _filesState = MutableStateFlow<UiState<List<RemoteFile>>>(UiState.Loading)
    val filesState: StateFlow<UiState<List<RemoteFile>>> = _filesState.asStateFlow()

    private val _uploadState = MutableStateFlow<UiState<UploadResponse>?>(null)
    val uploadState: StateFlow<UiState<UploadResponse>?> = _uploadState.asStateFlow()

    private val _downloadState = MutableStateFlow<UiState<String>?>(null)
    val downloadState: StateFlow<UiState<String>?> = _downloadState.asStateFlow()

    private val _stats = MutableStateFlow<StatsResponse?>(null)
    val stats: StateFlow<StatsResponse?> = _stats.asStateFlow()

    init {
        val saved = repository.getSavedServerUrl()
        if (saved.isNotEmpty()) {
            _serverUrl.value = saved
            connect(saved)
        }
    }

    fun connect(url: String) {
        if (url.isBlank()) return
        repository.setServerUrl(url)
        _serverUrl.value = url
        _connectionState.value = UiState.Loading

        viewModelScope.launch {
            repository.getServerInfo()
                .onSuccess { info ->
                    _connectionState.value = UiState.Success(info)
                    loadFiles()
                    loadStats()
                }
                .onFailure { e ->
                    _connectionState.value = UiState.Error(
                        "Cannot reach server at $url\n${e.message}"
                    )
                }
        }
    }

    fun loadFiles() {
        viewModelScope.launch {
            _filesState.value = UiState.Loading
            repository.listFiles()
                .onSuccess { res -> _filesState.value = UiState.Success(res.files) }
                .onFailure { e -> _filesState.value = UiState.Error(e.message ?: "Failed to load files") }
        }
    }

    fun loadStats() {
        viewModelScope.launch {
            repository.getStats()
                .onSuccess { stats -> _stats.value = stats }
                .onFailure {}
        }
    }

    fun uploadFile(uri: Uri) {
        viewModelScope.launch {
            repository.uploadFile(uri).collect { state ->
                _uploadState.value = state
                if (state is UiState.Success) {
                    loadFiles()
                    loadStats()
                }
            }
        }
    }

    fun downloadFile(file: RemoteFile) {
        viewModelScope.launch {
            _downloadState.value = UiState.Loading
            repository.downloadFile(file)
                .onSuccess { f ->
                    _downloadState.value = UiState.Success("Saved to Downloads/LocalBeam/${f.name}")
                }
                .onFailure { e ->
                    _downloadState.value = UiState.Error(e.message ?: "Download failed")
                }
        }
    }

    fun deleteFile(filename: String) {
        viewModelScope.launch {
            repository.deleteFile(filename)
                .onSuccess { loadFiles(); loadStats() }
                .onFailure { e -> _filesState.value = UiState.Error(e.message ?: "Delete failed") }
        }
    }

    fun clearUploadState() { _uploadState.value = null }
    fun clearDownloadState() { _downloadState.value = null }
}
