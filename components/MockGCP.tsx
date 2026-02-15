import React from 'react';

interface MockGCPProps {
  currentSection: string;
}

export const MockGCP: React.FC<MockGCPProps> = ({ currentSection }) => {
  return (
    <div className="w-full h-full bg-white text-gray-800 flex flex-col font-sans select-none">
      {/* Top Bar */}
      <div className="h-12 bg-[#1a73e8] flex items-center px-4 text-white shadow-md z-10">
        <div className="flex items-center space-x-4">
          <i className="fa-solid fa-bars text-xl cursor-pointer"></i>
          <span className="font-semibold text-lg">Google Cloud Platform</span>
          <div className="px-3 py-1 bg-blue-700 rounded text-sm flex items-center space-x-2 cursor-pointer border border-blue-600">
             <span>My First Project</span>
             <i className="fa-solid fa-caret-down text-xs"></i>
          </div>
        </div>
        <div className="flex-1 mx-8">
            <div className="bg-[#4285f4] rounded flex items-center px-3 h-8 w-1/2 mx-auto">
                <i className="fa-solid fa-search text-blue-200"></i>
                <span className="ml-2 text-blue-100 text-sm">Search products and resources</span>
            </div>
        </div>
        <div className="flex items-center space-x-4">
           <i className="fa-solid fa-terminal cursor-pointer hover:text-blue-200"></i>
           <img src="https://picsum.photos/32/32" className="rounded-full w-8 h-8 border border-white/50" alt="User" />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col pt-4">
          <div className={`px-6 py-2 flex items-center space-x-3 cursor-pointer hover:bg-blue-50 ${currentSection === 'Dashboard' ? 'text-[#1a73e8] bg-blue-50 font-medium' : 'text-gray-600'}`}>
            <i className="fa-solid fa-house w-5"></i>
            <span>Dashboard</span>
          </div>
          <div className={`px-6 py-2 flex items-center space-x-3 cursor-pointer hover:bg-blue-50 ${currentSection === 'Cloud Run' ? 'text-[#1a73e8] bg-blue-50 font-medium' : 'text-gray-600'}`}>
            <i className="fa-solid fa-rocket w-5"></i>
            <span>Cloud Run</span>
          </div>
          <div className={`px-6 py-2 flex items-center space-x-3 cursor-pointer hover:bg-blue-50 ${currentSection === 'Compute Engine' ? 'text-[#1a73e8] bg-blue-50 font-medium' : 'text-gray-600'}`}>
            <i className="fa-solid fa-server w-5"></i>
            <span>Compute Engine</span>
          </div>
          <div className={`px-6 py-2 flex items-center space-x-3 cursor-pointer hover:bg-blue-50 ${currentSection === 'IAM' ? 'text-[#1a73e8] bg-blue-50 font-medium' : 'text-gray-600'}`}>
            <i className="fa-solid fa-shield-halved w-5"></i>
            <span>IAM & Admin</span>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 bg-white p-8 overflow-y-auto">
            {/* 1. DASHBOARD MOCK */}
            {currentSection === 'Dashboard' && (
                <div className="grid grid-cols-3 gap-6">
                    <div className="col-span-2 space-y-6">
                        <div className="border border-gray-200 rounded p-4 shadow-sm">
                            <h3 className="text-lg font-medium mb-2">Project Info</h3>
                            <div className="text-sm text-gray-600">
                                <p>Project Name: My First Project</p>
                                <p>Project ID: profound-vertex-12345</p>
                                <p>Project Number: 1029384756</p>
                            </div>
                        </div>
                        <div className="border border-gray-200 rounded p-4 shadow-sm h-64 flex items-center justify-center bg-gray-50">
                            <div className="text-center">
                                <i className="fa-solid fa-chart-line text-4xl text-gray-300 mb-2"></i>
                                <p className="text-gray-400">Resource Usage (CPU/Memory)</p>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-6">
                        <div className="border border-gray-200 rounded p-4 shadow-sm">
                            <h3 className="text-lg font-medium mb-2">API Status</h3>
                            <div className="flex items-center text-green-600 text-sm">
                                <i className="fa-solid fa-check-circle mr-2"></i>
                                <span>All systems normal</span>
                            </div>
                        </div>
                        <div className="border border-gray-200 rounded p-4 shadow-sm bg-blue-50">
                             <h3 className="text-lg font-medium mb-2 text-blue-800">Billing</h3>
                             <p className="text-2xl font-bold text-gray-800">$1,240.50</p>
                             <p className="text-sm text-gray-500">Estimated charges this month</p>
                        </div>
                    </div>
                </div>
            )}

            {/* 2. CLOUD RUN MOCK */}
            {currentSection === 'Cloud Run' && (
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-normal">Cloud Run Services</h2>
                        <button className="bg-[#1a73e8] text-white px-4 py-2 rounded shadow text-sm font-medium hover:bg-blue-700 transition-colors">
                            <i className="fa-solid fa-plus mr-2"></i> Create Service
                        </button>
                    </div>
                    
                    <div className="border border-gray-200 rounded shadow-sm">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
                                <tr>
                                    <th className="px-6 py-3 font-medium">Name</th>
                                    <th className="px-6 py-3 font-medium">Region</th>
                                    <th className="px-6 py-3 font-medium">Status</th>
                                    <th className="px-6 py-3 font-medium">Last Deployed</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                <tr className="hover:bg-gray-50 cursor-pointer">
                                    <td className="px-6 py-4 font-medium text-[#1a73e8]">auth-service-v1</td>
                                    <td className="px-6 py-4">us-central1</td>
                                    <td className="px-6 py-4"><span className="text-green-600"><i className="fa-solid fa-check-circle mr-1"></i> Healthy</span></td>
                                    <td className="px-6 py-4 text-gray-500">2 hours ago</td>
                                </tr>
                                <tr className="hover:bg-gray-50 cursor-pointer">
                                    <td className="px-6 py-4 font-medium text-[#1a73e8]">payment-gateway</td>
                                    <td className="px-6 py-4">europe-west1</td>
                                    <td className="px-6 py-4"><span className="text-green-600"><i className="fa-solid fa-check-circle mr-1"></i> Healthy</span></td>
                                    <td className="px-6 py-4 text-gray-500">1 day ago</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* 3. COMPUTE ENGINE MOCK */}
            {currentSection === 'Compute Engine' && (
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-normal">VM Instances</h2>
                        <div className="space-x-2">
                             <button className="bg-[#1a73e8] text-white px-4 py-2 rounded shadow text-sm font-medium hover:bg-blue-700 transition-colors">
                                <i className="fa-solid fa-plus mr-2"></i> Create Instance
                            </button>
                        </div>
                    </div>
                    
                    <div className="border border-gray-200 rounded shadow-sm">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
                                <tr>
                                    <th className="px-6 py-3 font-medium">Name</th>
                                    <th className="px-6 py-3 font-medium">Zone</th>
                                    <th className="px-6 py-3 font-medium">Internal IP</th>
                                    <th className="px-6 py-3 font-medium">External IP</th>
                                    <th className="px-6 py-3 font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                <tr className="hover:bg-gray-50 cursor-pointer">
                                    <td className="px-6 py-4 font-medium text-[#1a73e8]">instance-1</td>
                                    <td className="px-6 py-4">us-central1-a</td>
                                    <td className="px-6 py-4">10.128.0.2</td>
                                    <td className="px-6 py-4">34.68.123.45</td>
                                    <td className="px-6 py-4"><span className="text-green-600"><i className="fa-solid fa-check-circle mr-1"></i> Running</span></td>
                                </tr>
                                <tr className="hover:bg-gray-50 cursor-pointer">
                                    <td className="px-6 py-4 font-medium text-[#1a73e8]">worker-pool-main</td>
                                    <td className="px-6 py-4">us-central1-f</td>
                                    <td className="px-6 py-4">10.128.0.5</td>
                                    <td className="px-6 py-4">34.172.99.12</td>
                                    <td className="px-6 py-4"><span className="text-green-600"><i className="fa-solid fa-check-circle mr-1"></i> Running</span></td>
                                </tr>
                                <tr className="hover:bg-gray-50 cursor-pointer bg-gray-50/50">
                                    <td className="px-6 py-4 font-medium text-gray-500">legacy-monolith</td>
                                    <td className="px-6 py-4 text-gray-500">us-east1-b</td>
                                    <td className="px-6 py-4 text-gray-500">10.142.0.2</td>
                                    <td className="px-6 py-4 text-gray-500">-</td>
                                    <td className="px-6 py-4"><span className="text-gray-400"><i className="fa-regular fa-circle-stop mr-1"></i> Stopped</span></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* 4. IAM MOCK */}
            {currentSection === 'IAM' && (
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-normal">IAM & Admin</h2>
                        <button className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded shadow-sm text-sm font-medium hover:bg-gray-50 transition-colors">
                            <i className="fa-solid fa-user-plus mr-2"></i> Grant Access
                        </button>
                    </div>
                    
                    <div className="bg-blue-50 border border-blue-200 p-4 rounded text-sm text-blue-800 flex items-start">
                         <i className="fa-solid fa-circle-info mt-0.5 mr-2"></i>
                         <p>You are viewing permissions for "My First Project". Ensure you follow the principle of least privilege.</p>
                    </div>

                    <div className="border border-gray-200 rounded shadow-sm">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
                                <tr>
                                    <th className="px-6 py-3 font-medium">Principal</th>
                                    <th className="px-6 py-3 font-medium">Role</th>
                                    <th className="px-6 py-3 font-medium">Type</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                <tr className="hover:bg-gray-50 cursor-pointer">
                                    <td className="px-6 py-4 font-medium">admin@company.com</td>
                                    <td className="px-6 py-4">Owner</td>
                                    <td className="px-6 py-4"><span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs border border-gray-200">User</span></td>
                                </tr>
                                <tr className="hover:bg-gray-50 cursor-pointer">
                                    <td className="px-6 py-4 font-medium">deploy-bot@profound-vertex.iam.gserviceaccount.com</td>
                                    <td className="px-6 py-4">Cloud Run Admin, Storage Admin</td>
                                    <td className="px-6 py-4"><span className="bg-purple-50 text-purple-600 px-2 py-0.5 rounded text-xs border border-purple-200">Service Account</span></td>
                                </tr>
                                <tr className="hover:bg-gray-50 cursor-pointer">
                                    <td className="px-6 py-4 font-medium">viewer@company.com</td>
                                    <td className="px-6 py-4">Viewer</td>
                                    <td className="px-6 py-4"><span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs border border-gray-200">User</span></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};