package com.localbeam.ui

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.android.material.snackbar.Snackbar
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import com.localbeam.R
import com.localbeam.databinding.ActivityMainBinding
import com.localbeam.models.RemoteFile
import com.localbeam.models.UiState
import com.localbeam.utils.FileRepository
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var viewModel: MainViewModel
    private lateinit var fileAdapter: FileListAdapter

    // File picker launcher
    private val filePicker = registerForActivityResult(
        ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        uris.forEach { uri -> viewModel.uploadFile(uri) }
    }

    // QR Scanner launcher
    private val qrScanner = registerForActivityResult(ScanContract()) { result ->
        result.contents?.let { url ->
            binding.etServerUrl.setText(url)
            viewModel.connect(url)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val repo = FileRepository(applicationContext)
        viewModel = ViewModelProvider(this, MainViewModelFactory(repo))[MainViewModel::class.java]

        setupUI()
        observeViewModel()
    }

    private fun setupUI() {
        // Toolbar
        setSupportActionBar(binding.toolbar)

        // RecyclerView
        fileAdapter = FileListAdapter(
            onDownload = { file -> viewModel.downloadFile(file) },
            onDelete = { file -> confirmDelete(file) }
        )
        binding.rvFiles.apply {
            layoutManager = LinearLayoutManager(this@MainActivity)
            adapter = fileAdapter
        }

        // SwipeRefresh
        binding.swipeRefresh.setOnRefreshListener {
            viewModel.loadFiles()
            viewModel.loadStats()
        }

        // Refresh button in files card
        binding.btnRefresh?.setOnClickListener {
            viewModel.loadFiles()
            viewModel.loadStats()
        }

        // Connect button
        binding.btnConnect.setOnClickListener {
            val url = binding.etServerUrl.text.toString().trim()
            if (url.isEmpty()) {
                binding.tilServerUrl.error = "Enter server URL"
                return@setOnClickListener
            }
            binding.tilServerUrl.error = null
            viewModel.connect(url)
        }

        // QR scan button
        binding.btnScanQr.setOnClickListener {
            qrScanner.launch(
                ScanOptions().apply {
                    setCaptureActivity(PortraitCaptureActivity::class.java)
                    setPrompt("Scan LocalBeam QR Code")
                    setBeepEnabled(false)
                    setOrientationLocked(true)
                }
            )
        }

        // Upload FAB
        binding.fabUpload.setOnClickListener {
            filePicker.launch("*/*")
        }
    }

    private fun observeViewModel() {
        lifecycleScope.launch {
            viewModel.connectionState.collect { state ->
                when (state) {
                    is UiState.Loading -> {
                        binding.connectionCard.visibility = View.VISIBLE
                        binding.tvConnectionStatus.text = "Connecting…"
                        binding.tvConnectionStatus.setTextColor(getColor(R.color.colorTextMid))
                        binding.progressConnection.visibility = View.VISIBLE
                    }
                    is UiState.Success -> {
                        binding.tvConnectionStatus.text = "Connected to ${state.data.ip}:${state.data.port}"
                        binding.tvConnectionStatus.setTextColor(getColor(R.color.colorAccent3))
                        binding.progressConnection.visibility = View.GONE
                        binding.fabUpload.show()
                        binding.filesCard.visibility = View.VISIBLE
                        binding.swipeRefresh.visibility = View.VISIBLE
                    }
                    is UiState.Error -> {
                        binding.tvConnectionStatus.text = state.message
                        binding.tvConnectionStatus.setTextColor(getColor(R.color.colorDanger))
                        binding.progressConnection.visibility = View.GONE
                    }
                }
            }
        }

        lifecycleScope.launch {
            viewModel.filesState.collect { state ->
                binding.swipeRefresh.isRefreshing = false
                when (state) {
                    is UiState.Loading -> {
                        binding.progressFiles.visibility = View.VISIBLE
                        binding.tvEmptyState.visibility = View.GONE
                    }
                    is UiState.Success -> {
                        binding.progressFiles.visibility = View.GONE
                        if (state.data.isEmpty()) {
                            binding.tvEmptyState.visibility = View.VISIBLE
                            binding.rvFiles.visibility = View.GONE
                        } else {
                            binding.tvEmptyState.visibility = View.GONE
                            binding.rvFiles.visibility = View.VISIBLE
                            fileAdapter.submitList(state.data)
                        }
                    }
                    is UiState.Error -> {
                        binding.progressFiles.visibility = View.GONE
                        showSnackbar(state.message, isError = true)
                    }
                }
            }
        }

        lifecycleScope.launch {
            viewModel.uploadState.collect { state ->
                when (state) {
                    is UiState.Loading -> showSnackbar("Uploading…")
                    is UiState.Success -> {
                        showSnackbar("Upload complete")
                        viewModel.clearUploadState()
                        viewModel.loadFiles()
                        viewModel.loadStats()
                    }
                    is UiState.Error -> {
                        showSnackbar("Upload failed: ${state.message}", isError = true)
                        viewModel.clearUploadState()
                    }
                    null -> {}
                }
            }
        }

        lifecycleScope.launch {
            viewModel.downloadState.collect { state ->
                when (state) {
                    is UiState.Loading -> showSnackbar("Downloading…")
                    is UiState.Success -> {
                        showSnackbar(state.data)
                        viewModel.clearDownloadState()
                    }
                    is UiState.Error -> {
                        showSnackbar("Download failed: ${state.message}", isError = true)
                        viewModel.clearDownloadState()
                    }
                    null -> {}
                }
            }
        }

        lifecycleScope.launch {
            viewModel.stats.collect { stats ->
                stats?.let {
                    binding.tvStats.text = "${it.fileCount} files · ${it.totalSizeFormatted}"
                }
            }
        }
    }

    private fun confirmDelete(file: RemoteFile) {
        AlertDialog.Builder(this)
            .setTitle("Delete File")
            .setMessage("Delete \"${file.originalName}\"?")
            .setPositiveButton("Delete") { _, _ -> viewModel.deleteFile(file.name) }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showSnackbar(message: String, isError: Boolean = false) {
        val snack = Snackbar.make(binding.root, message, Snackbar.LENGTH_LONG)
        if (isError) snack.setBackgroundTint(getColor(android.R.color.holo_red_dark))
        snack.show()
    }
}

class MainViewModelFactory(private val repo: FileRepository) :
    ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T =
        MainViewModel(repo) as T
}
